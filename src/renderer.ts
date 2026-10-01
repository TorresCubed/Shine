import { polygonsPath, cellCenter, mirrorSegment, easeInOut } from "./util";
import { tryMove, updateAim, updateMirrors } from "./playerLogic";
import { getScene } from "./scene";
import { castLight, castFlashlight, fadeProfile, fadeAt, insideAny, brightnessAt, clearDistance } from "./rayTracer";
import type { LightGroup, Penumbra } from "./rayTracer";
import type { GridPos, LightKind, Point, Scene, Segment, Wall } from "./interfaces";
import { updateDoors } from "./doorLogic";
import { screenDark, cardShown } from "./transition";
import {
  CANDLE_RADIUS, LAMP_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE, MAX_MIRROR_BOUNCES, GRID_SIZE, TARGET_FPS,
  CANDLE_RAY_COUNT, LIT_FLOOR_STRENGTH, LIT_FLOOR_TINT, FOG_MEMORY_SCALE, FOG_FALLOFF_SHOULDER, FOG_FLOOR_BRIGHTNESS, FOG_VISIBILITY, MEMORY_FADE_S, MEMORY_FADE_MIN,
  LIGHT_IGNITE_MS, WALL_LIGHT_PENETRATION, LIGHT_FALLOFF_STOPS, PLAYER_SPRITES, FLASHLIGHT_BACK, LIGHT_EDGE_GAP, SHADOW_SOFT_STEPS,
  PLAYER_SPRITE_SCALE, OBJECT_SPRITES, PLATE_MID_MS, PLATE_WINK_SHIFT_MS, PLATE_WINK_FLARE_MS, PLATE_WINK_FADE_MS, PLATE_WINK_FLARE, MIRROR_STEPS, DOOR_ART_WIDTH, FLAME_FLICKER_REACH, FLAME_FLICKER_BRIGHTNESS,
  IDLE_STYLE, IDLE_BREATHE, IDLE_BOB, IDLE_PERIOD_MS, IDLE_FADE_MS, ZOOM_EASE_MS, PUNCH_SCALE, PUNCH_MS, LEVER_FLICK_MS,
  DUST_PER_CELL, DUST_SPEED, DUST_SIZE, DUST_BRIGHTNESS, DUST_TWINKLE_MS, WIN_DIM, WIN_FADE_MS, CARD_FADE_MS,
  CAMERA_PAN_RETURN,
} from "./consts";
import { player, levelWalls, doors, doorLeaves, allDoorLeaves, lamps, mirrors, levers, lightState, start, goal, gameState, camera, punches, shines, input } from "./state";
import type { DoorState, MirrorState } from "./state";
import { canvas, ctx, clampZoom, pixelRatio, worldCanvas, worldCtx, exploredCanvas, exploredCtx, recentCanvas, recentCtx, litLayer, litCtx, regionLayer, regionCtx } from "./main";

const FRAME_INTERVAL = 1000 / TARGET_FPS;

// How the world is shown. 'normal' is the game. The other two are for playtesting levels from the
// editor: 'fog' shows the whole level as if already explored, with every light's reach drawn (not
// just what's in line of sight); 'bright' shows the whole level fully lit, with light as a tinted
// overlay. Either way, doors and mirrors always show as they are.
export type ViewMode = 'normal' | 'fog' | 'bright';
let viewMode: ViewMode = 'normal';
export const setViewMode = (mode: ViewMode) => { viewMode = mode; };
export const nextViewMode = () => { viewMode = viewMode === 'fog' ? 'bright' : viewMode === 'bright' ? 'normal' : 'fog'; };

let lastFrameTime = -Infinity;
let frameTime = 0; // this frame's time, for animation
let idle = 0;      // 0 walking, 1 settled into standing still
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;

// Profiling (?perf): how long each part of a frame takes on the CPU, averaged over PERF_FRAMES
// frames, shown under the fps and kept in document.body.dataset.perf. The GPU's share can't be timed
// from here (reading pixels back to force it makes Chrome move the canvas off the GPU, which is far
// slower), so ?skip=a,b turns parts of the drawing off instead: compare fps with each off. Parts:
// fog (the remembered layer), memory (writing it), lit (lit regions), floor (a lit region's floor,
// marks and tint), faces (lit wall and door faces), soft (soft shadow edges), sight (cutting light to line of sight), objects
// (lights on the floor, the player, shines), screen (the world onto the screen).
const params = new URLSearchParams(location.search);
const perfParam = params.get('perf');
const skip = new Set((params.get('skip') ?? '').split(',').filter(Boolean));
const PERF_FRAMES = 60;
const perfTotals = new Map<string, number>();
let perfAt = 0, perfFrames = 0, perfText = '';
const perfMark = (name: string) => {
  if (perfParam === null) return;
  const t = performance.now();
  perfTotals.set(name, (perfTotals.get(name) ?? 0) + t - perfAt);
  perfAt = t;
}
const perfFrameStart = () => {
  if (perfParam === null) return;
  perfAt = performance.now();
}
const perfFrameEnd = () => {
  if (perfParam === null || ++perfFrames < PERF_FRAMES) return;
  let total = 0;
  const parts = [...perfTotals].map(([name, ms]) => { total += ms; return `${name} ${(ms / perfFrames).toFixed(1)}`; });
  perfText = `${(total / perfFrames).toFixed(1)} ms/frame: ${parts.join(' · ')}`;
  document.body.dataset.perf = perfText;
  perfTotals.clear();
  perfFrames = 0;
}
// Last frame's light, for the fear rule on the next move, and what was held when it was cast. If the
// held light has changed since (e.g. just dropped), that light is stale, so none is used.
let litGroups: LightGroup[] = [];
let litGroupsHeld: LightKind | null = null;

// One cell of floor or wall, repeated as a pattern, and a desaturated, darkened copy of each for fog
// memory. The art is scaled to a cell with smoothing off, so pixel art stays crisp at any resolution.
const makeTile = () => {
  const tile = document.createElement('canvas');
  tile.width = tile.height = GRID_SIZE;
  return tile;
}
const floorTile = makeTile(), dimFloorTile = makeTile();
const paintTiles = (img: HTMLImageElement, lit: HTMLCanvasElement, dim: HTMLCanvasElement) => {
  const t = lit.getContext('2d')!;
  t.imageSmoothingEnabled = false;
  t.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);
  const d = dim.getContext('2d')!;
  d.filter = `grayscale(1) brightness(${FOG_FLOOR_BRIGHTNESS})`;
  d.drawImage(lit, 0, 0);
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`couldn't load ${url}`));
  img.src = url;
});

// Every image in src/assets, by file name.
const assetUrls = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.slice('./assets/'.length), url]),
);
type SpriteKind = keyof typeof PLAYER_SPRITES;
const playerSprites = {} as Record<SpriteKind, HTMLImageElement>;

export const loadAssets = async () => {
  const kinds = Object.keys(PLAYER_SPRITES) as SpriteKind[];
  const objects = Object.keys(OBJECT_SPRITES) as ObjectKind[];
  const [floor, wall, ...images] = await Promise.all([
    loadImage(assetUrls['floorboards.png']),
    loadImage(assetUrls['walls.png']),
    ...kinds.map(k => loadImage(assetUrls[PLAYER_SPRITES[k].file])),
    ...objects.map(k => loadImage(assetUrls[OBJECT_SPRITES[k].file])),
  ]);
  kinds.forEach((k, i) => playerSprites[k] = images[i]);
  objects.forEach((k, i) => {
    const lit = images[kinds.length + i];
    const dim = document.createElement('canvas');
    dim.width = lit.width;
    dim.height = lit.height;
    const d = dim.getContext('2d')!;
    d.filter = `grayscale(1) brightness(${FOG_FLOOR_BRIGHTNESS})`;
    d.drawImage(lit, 0, 0);
    objectArt[k] = { lit, dim };
  });
  paintTiles(floor, floorTile, dimFloorTile);
  wallImage = wall;
}

// Walls are autotiled from walls.png: every wall cell gets the tile's middle, and only the sides that
// face floor get its rim, so neighbouring wall cells join into one solid wall. Corners are the tile's
// own outer corner, a continuing edge, or an inner corner (the rim bent round, where only the
// diagonal is floor). Baked once per level into wallArt, with a grayed, darkened copy for fog memory.
const WALL_RIM = 4; // how deep the rim is in walls.png, in its pixels
let wallImage: HTMLImageElement;
const wallArt = document.createElement('canvas');
const dimWallArt = document.createElement('canvas');
// The walls as a solid mask (opaque in walls, clear elsewhere), for trimming lit wall faces to them,
// and as a grid (1 = wall cell, row by row), for quick lookups.
const wallMask = document.createElement('canvas');
let wallCells = new Uint8Array(0);
let wallArtFor: Wall[] | null = null;
const ensureWallArt = () => {
  if (wallArtFor === levelWalls) return;
  wallArtFor = levelWalls;
  const cols = worldCanvas.width / GRID_SIZE, rows = worldCanvas.height / GRID_SIZE;
  const isWall = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return true; // no rim facing out of the level
    const { x, y } = cellCenter({ gridX: gx, gridY: gy });
    return levelWalls.some(w => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
  }

  wallArt.width = dimWallArt.width = wallMask.width = worldCanvas.width;
  wallArt.height = dimWallArt.height = wallMask.height = worldCanvas.height;
  const m = wallMask.getContext('2d')!;
  m.fillStyle = '#fff';
  for (const w of levelWalls) m.fillRect(w.x, w.y, w.w, w.h);
  wallCells = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) wallCells[gy * cols + gx] = isWall(gx, gy) ? 1 : 0;
  const c = wallArt.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const n = wallImage.width, r = WALL_RIM, k = GRID_SIZE / n, mid = n - 2 * r;
  // Copies a rect of walls.png (in its pixels) to that offset within the cell at (x0, y0).
  const piece = (x0: number, y0: number, sx: number, sy: number, sw: number, sh: number, dx = sx, dy = sy) =>
    c.drawImage(wallImage, sx, sy, sw, sh, x0 + dx * k, y0 + dy * k, sw * k, sh * k);

  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (!isWall(gx, gy)) continue;
    const x0 = gx * GRID_SIZE, y0 = gy * GRID_SIZE;
    const up = isWall(gx, gy - 1), down = isWall(gx, gy + 1), left = isWall(gx - 1, gy), right = isWall(gx + 1, gy);
    piece(x0, y0, r, r, mid, mid);
    // Sides: the rim if it faces floor, otherwise more of the middle.
    piece(x0, y0, r, up ? r : 0, mid, r, r, 0);
    piece(x0, y0, r, down ? n - 2 * r : n - r, mid, r, r, n - r);
    piece(x0, y0, left ? r : 0, r, r, mid, 0, r);
    piece(x0, y0, right ? n - 2 * r : n - r, r, r, mid, n - r, r);
    // Corners.
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const vert = cy < 0 ? up : down, horiz = cx < 0 ? left : right, diag = isWall(gx + cx, gy + cy);
      const dx = cx < 0 ? 0 : n - r, dy = cy < 0 ? 0 : n - r;           // the corner's spot in the cell
      const inX = cx < 0 ? r : n - 2 * r, inY = cy < 0 ? r : n - 2 * r;   // the same, one rim further in
      if (!vert && !horiz) piece(x0, y0, dx, dy, r, r);                 // outer corner
      else if (!vert) piece(x0, y0, inX, dy, r, r, dx, dy);             // top/bottom rim runs through
      else if (!horiz) piece(x0, y0, dx, inY, r, r, dx, dy);            // side rim runs through
      else if (diag) piece(x0, y0, inX, inY, r, r, dx, dy);             // solid wall
      else {
        // Inner corner: each pixel is the rim at its distance from the corner point, taken from the
        // middle of the top or bottom rim.
        for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) {
          const depth = Math.max(i, j);
          const px = cx < 0 ? i : r - 1 - i, py = cy < 0 ? j : r - 1 - j;
          piece(x0, y0, n >> 1, cy < 0 ? depth : n - 1 - depth, 1, 1, dx + px, dy + py);
        }
      }
    }
  }

  const d = dimWallArt.getContext('2d')!;
  d.filter = `grayscale(1) brightness(${FOG_FLOOR_BRIGHTNESS})`;
  d.drawImage(wallArt, 0, 0);
}

// A door leaf as a filled quad, DOOR_ART_WIDTH wide (for a locked door's flash).
const leafPath = (c: CanvasRenderingContext2D, s: Segment) => {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
  const nx = -(s.y2 - s.y1) / len * DOOR_ART_WIDTH / 2, ny = (s.x2 - s.x1) / len * DOOR_ART_WIDTH / 2;
  const q = [{ x: s.x1 + nx, y: s.y1 + ny }, { x: s.x2 + nx, y: s.y2 + ny }, { x: s.x2 - nx, y: s.y2 - ny }, { x: s.x1 - nx, y: s.y1 - ny }];
  if (signedArea(q) < 0) q.reverse();
  c.moveTo(q[0].x, q[0].y);
  for (const p of q) c.lineTo(p.x, p.y);
  c.closePath();
}

// When a locked door unlocks (or locks again) it flashes green (or red),
// glowing up and fading back to how it looked, over LOCK_FLASH_MS. It shows even in fog, where
// nothing else changes unseen, so you know your light reached its plate; but only once you've seen
// the door, so it never gives away one you haven't found.
const LOCK_FLASH_MS = 900;
const drawLockFlashes = (c: CanvasRenderingContext2D) => {
  for (const door of doors) {
    const t = (frameTime - door.lockFlashAt) / LOCK_FLASH_MS;
    if (door.kind !== 'locked' || !door.everSeen || t < 0 || t >= 1) continue;
    const color = door.triggerOn || door.opened ? '#7dff5a' : '#ff4a3a';
    c.save();
    c.globalAlpha = Math.sin(Math.PI * Math.sqrt(t)); // quick to flare, slower to fade
    c.fillStyle = c.shadowColor = color;
    c.shadowBlur = 0.4 * GRID_SIZE;
    c.beginPath();
    for (const s of doorLeaves(door, door.seenOpenAmount)) leafPath(c, s);
    c.fill();
    c.restore();
  }
}

// A shine where a light was picked up or dropped: a warm glow that flares and fades, and a four-point
// glint (long rays up/down/left/right, short diagonal ones) that grows, turns a little and shrinks
// away, over SHINE_MS. Drawn on top of everything, added ('lighter') so it glows. Its size is in
// cells, but never under SHINE_MIN_CSS_PX on screen, so it still reads zoomed out on a phone.
// The candle's glow colour (the warm tint a lit region gets), shared with the shine so it matches.
const CANDLE_GLOW_RGB = '255, 220, 150';
const SHINE_MS = 750;
const SHINE_SIZE = 0.2;       // cells, the long rays' length at their longest
const SHINE_MIN_CSS_PX = 20;
const drawShines = (c: CanvasRenderingContext2D) => {
  for (let i = shines.length - 1; i >= 0; i--) if (frameTime - shines[i].at >= SHINE_MS) shines.splice(i, 1);
  const size = Math.max(SHINE_SIZE * GRID_SIZE, SHINE_MIN_CSS_PX * pixelRatio / screenView.zoom);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const s of shines) {
    const t = Math.max(0, (frameTime - s.at) / SHINE_MS);
    const strength = Math.sin(Math.PI * Math.sqrt(t)); // flares quickly, fades slower
    const glow = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, size * (0.4 + 0.4 * t));
    glow.addColorStop(0, `rgba(${CANDLE_GLOW_RGB}, ${0.55 * strength})`);
    glow.addColorStop(1, `rgba(${CANDLE_GLOW_RGB}, 0)`);
    c.fillStyle = glow;
    c.fillRect(s.x - size, s.y - size, size * 2, size * 2);

    // The glint: thin tapered rays, each a diamond from the centre.
    c.translate(s.x, s.y);
    c.rotate(t * Math.PI /2);
    c.fillStyle = `rgba(${CANDLE_GLOW_RGB}, ${0.6 * strength})`;
    const ray = (angle: number, len: number, width: number) => {
      c.save();
      c.rotate(angle);
      c.beginPath();
      c.moveTo(0, -width); c.lineTo(len, 0); c.lineTo(0, width); c.lineTo(-len, 0);
      c.closePath();
      c.fill();
      c.restore();
    };
    const len = size * strength, width = size * 0.07;
    ray(0, len, width);
    ray(Math.PI / 2, len, width);
    ray(Math.PI / 4, len * 0.45, width * 0.8);
    ray(-Math.PI / 4, len * 0.45, width * 0.8);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  c.restore();
}

// How much a punched thing is scaled right now: popping up quickly (eased), then settling back.
const punchScale = (key: string) => {
  const at = punches.get(key);
  const t = at === undefined ? 1 : (frameTime - at) / PUNCH_MS;
  if (t < 0 || t >= 1) return 1;
  const rise = 0.3; // of the punch spent popping up
  return 1 + PUNCH_SCALE * (t < rise ? easeInOut(t / rise) : 1 - easeInOut((t - rise) / (1 - rise)));
}

// A lever pulled within the last LEVER_FLICK_MS is mid-flick (its punch marks when it was pulled).
const leverFlicking = (l: GridPos) => frameTime - (punches.get(`lever ${l.gridX},${l.gridY}`) ?? -Infinity) < LEVER_FLICK_MS;

// Object art, as drawn and as remembered in fog (grayed and darkened like the floor), turned by
// `angle` about its anchor. Art is scaled so its canvas is one cell, with smoothing off.
type ObjectKind = keyof typeof OBJECT_SPRITES;
const objectArt = {} as Record<ObjectKind, { lit: HTMLImageElement; dim: HTMLCanvasElement }>;
const drawObject = (c: CanvasRenderingContext2D, kind: ObjectKind, x: number, y: number, angle: number, dim: boolean, scale = 1) => {
  const art = objectArt[kind], k = GRID_SIZE / art.lit.width, { anchor } = OBJECT_SPRITES[kind];
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(k * scale, k * scale);
  c.imageSmoothingEnabled = false;
  c.drawImage(dim ? art.dim : art.lit, -anchor.x, -anchor.y);
  c.restore();
}

// Everything that belongs to the floor (markers, lamps, plates, levers, unfound lights, mirrors) is
// painted into both the lit and the remembered floor, so it's hidden in darkness and remembered in
// fog like the floor itself. `dim` picks the fog palette, and draws mirrors as last seen.
const drawFloorMarks = (c: CanvasRenderingContext2D, dim: boolean, withDoors = true) => {
  c.lineWidth = 0.06 * GRID_SIZE;

  // Stairs: the way in at the start, and the way on at the exit.
  const s = cellCenter(start), g = cellCenter(goal);
  drawObject(c, 'stairs', s.x, s.y, 0, dim);
  drawObject(c, 'stairsExit', g.x, g.y, 0, dim);

  // Wall lamps: a mounting bar along the wall edge with a half-disc of glass bulging into the room.
  for (const l of lamps) {
    const p = cellCenter(l);
    const ex = p.x + l.toWallX * GRID_SIZE / 2, ey = p.y + l.toWallY * GRID_SIZE / 2;
    const alongX = Math.abs(l.toWallY), alongY = Math.abs(l.toWallX);
    const barHalf = GRID_SIZE * 0.25, barDepth = 0.08 * GRID_SIZE;
    c.fillStyle = dim ? '#6a6a6a' : '#b08a4a';
    c.fillRect(
      Math.min(ex - alongX * barHalf, ex - l.toWallX * barDepth),
      Math.min(ey - alongY * barHalf, ey - l.toWallY * barDepth),
      alongX * barHalf * 2 + alongY * barDepth,
      alongY * barHalf * 2 + alongX * barDepth,
    );
    const facing = Math.atan2(-l.toWallY, -l.toWallX);
    c.fillStyle = dim ? '#8a8a8a' : '#ffd27a';
    c.beginPath();
    c.arc(ex, ey, GRID_SIZE * 0.16, facing - Math.PI / 2, facing + Math.PI / 2);
    c.closePath();
    c.fill();
  }

  // Lights waiting to be found: only as remembered here; lit, they're drawn on top (see draw).
  if (dim) for (const p of lightState.pickups) drawObject(c, 'flashlight', p.x, p.y, p.aimAngle, true);

  // Plates: dead, on the floor. Awake, they shine over the darkness (see drawAwakePlates).
  for (const door of doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger);
    drawObject(c, 'plateDead', at.x, at.y, 0, dim);
  }

  // Levers: off or on, flicking through mid as pulled. One that turns mirrors is a wheel, upright to
  // start and turned as far as the (first) mirror it turns has turned since, so it spins as that
  // does, pull after pull.
  for (const l of levers) {
    // (No pop when pulled: the flick, or the wheel turning, shows it.)
    const at = cellCenter(l), turns = mirrors.find(m => m.control === l.id);
    if (turns) {
      drawObject(c, 'wheel', at.x, at.y, turns.turned * Math.PI / MIRROR_STEPS, dim); // upright to start
      continue;
    }
    const flicking = !dim && leverFlicking(l);
    drawObject(c, flicking ? 'leverMid' : l.on ? 'lever' : 'leverOff', at.x, at.y, 0, dim);
  }

  // Mirrors. Nothing shows which ones turn, or what turns them: you find out by trying.
  for (const m of mirrors) {
    const at = cellCenter(m), step = dim ? m.seenStep : m.shownStep;
    drawObject(c, 'mirror', at.x, at.y, step * Math.PI / MIRROR_STEPS - Math.PI / 2, dim); // the art is upright
  }

  // Doors: each leaf where it is (as last seen, in fog).
  if (withDoors) drawDoors(c, dim);
}
// Every door's art, turned to lie along each leaf from its hinge.
const drawDoors = (c: CanvasRenderingContext2D, dim: boolean) => {
  for (const door of doors) {
    for (const s of doorLeaves(door, dim ? door.seenOpenAmount : door.openAmount)) {
      drawObject(c, 'door', s.x1, s.y1, Math.atan2(s.y2 - s.y1, s.x2 - s.x1) - Math.PI / 2, dim);
    }
  }
}

// Lit wall faces, shaded by how squarely the light hits them (a face lit head-on is brighter than one
// it grazes) and, for a flashlight, by the beam's profile (brightest along its centre line, fading
// to its edges), from 55% up to the paint's own brightness. The brightest faces then glow: a copy of
// the paint added on top (`glow` of it, at full brightness), which brightens the wall while keeping
// its texture, rather than washing it out to white. Distance is handled by the caller's falloff.
// Edges are sorted into a few brightness bands so it's a handful of strokes, not one per edge.
const FACE_BANDS = 6;
// How strongly lit walls glow, by the light: a flashlight's beam is intense, a flame's glow soft.
const WALL_GLOW_FLASHLIGHT = 0.5;
const WALL_GLOW_FLAME = 0.12;
// A light's lit faces: the edges of its outline that lie against a wall or a door, each drawn as a
// thin quad reaching WALL_LIGHT_PENETRATION into it, square to the edge on the side away from the
// light, so the band stays inside the solid with no clipping. Most of a light's outline is where it runs out of range,
// or along a mirror; only the edges against a face are drawn (stroking the whole outline and
// clipping it to the walls was most of a frame's GPU time on a phone). An edge is against a face if
// its midpoint, nudged a little that way, is in a wall cell or on a door leaf. (Square to the edge,
// not along the light's direction: a wall lit at a grazing angle would be missed that way.) The
// quads are sorted into FACE_BANDS by how brightly they light it.
// A door leaf is too thin for a band (and traced as its centre line, so light stops halfway through
// it): a leaf the light touches anywhere is lit whole, as brightly as the light hits it most squarely.
type FaceBands = Point[][][]; // [band][quad] = its 4 corners
type Leaf = { door: DoorState; s: Segment };
const FACE_PROBE = 2; // px
const faceTarget = (x: number, y: number, leaves: Leaf[]): 'wall' | Leaf | null => {
  // Doors first: an open leaf lies flat along its cell's side, often against a wall face, and is
  // still the door there.
  for (const leaf of leaves) {
    const { s } = leaf, ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * ex + (y - s.y1) * ey) / (ex * ex + ey * ey || 1)));
    if (Math.hypot(x - (s.x1 + ex * t), y - (s.y1 + ey * t)) <= DOOR_ART_WIDTH / 2) return leaf;
  }
  const gx = Math.floor(x / GRID_SIZE), gy = Math.floor(y / GRID_SIZE);
  const cols = worldCanvas.width / GRID_SIZE, rows = worldCanvas.height / GRID_SIZE;
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || wallCells[gy * cols + gx]) return 'wall';
  return null;
}
const litFaces = (group: LightGroup): FaceBands => {
  const bands: FaceBands = Array.from({ length: FACE_BANDS }, () => []);
  const leaves: Leaf[] = doors.flatMap(door => doorLeaves(door, door.openAmount).map(s => ({ door, s })));
  const litLeaves = new Map<Leaf, number>(); // each leaf the light touches, and its brightest band
  const o = group.origin;
  for (const poly of group.polys) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      if (group.depth === 0 && (i === 0 || j === 0)) continue; // the fan's sides, out from the light
      const a = poly[i], b = poly[j];
      const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
      if (len < 0.5) continue;
      const mx = (a.x + b.x) / 2 - o.x, my = (a.y + b.y) / 2 - o.y, md = Math.hypot(mx, my) || 1;
      // The edge's normal, on the side away from the light.
      let nx = -ey / len, ny = ex / len;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const target = faceTarget(o.x + mx + nx * FACE_PROBE, o.y + my + ny * FACE_PROBE, leaves);
      if (!target) continue;
      const cos = Math.abs(mx * -ey + my * ex) / (len * md); // incidence vs. the face
      const beam = fadeAt({ x: o.x + mx, y: o.y + my }, group);
      // sqrt softens the fall-off toward grazing angles, so a wall lit along its length doesn't
      // drop to a dark line.
      const band = Math.min(FACE_BANDS - 1, Math.floor(Math.sqrt(cos) * beam * FACE_BANDS));
      if (target !== 'wall') { litLeaves.set(target, Math.max(band, litLeaves.get(target) ?? 0)); continue; }
      const d = WALL_LIGHT_PENETRATION;
      bands[band].push([a, b, { x: b.x + nx * d, y: b.y + ny * d }, { x: a.x + nx * d, y: a.y + ny * d }]);
    }
  }
  for (const [{ s }, band] of litLeaves) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, h = DOOR_ART_WIDTH / 2;
    const nx = -(s.y2 - s.y1) / len * h, ny = (s.x2 - s.x1) / len * h;
    bands[band].push([{ x: s.x1 + nx, y: s.y1 + ny }, { x: s.x2 + nx, y: s.y2 + ny }, { x: s.x2 - nx, y: s.y2 - ny }, { x: s.x1 - nx, y: s.y1 - ny }]);
  }
  return bands;
}
// A light's lit faces, worked out once a frame (the light map and fog memory both use them). Each
// frame's lights are new objects, so last frame's drop out on their own.
const facesCache = new WeakMap<LightGroup, FaceBands>();
const facesOf = (group: LightGroup) => {
  let bands = facesCache.get(group);
  if (!bands) facesCache.set(group, bands = litFaces(group));
  return bands;
}
// All wound the same way, so where quads overlap (at a corner, a door against a wall) they don't
// cancel into a hole under the nonzero rule.
const quadsPath = (c: CanvasRenderingContext2D, quads: Point[][]) => {
  for (const q of quads) {
    const order = signedArea(q) < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    c.moveTo(q[order[0]].x, q[order[0]].y);
    for (let k = 1; k < 4; k++) c.lineTo(q[order[k]].x, q[order[k]].y);
    c.closePath();
  }
}
// Each band's quads, with the light's falloff (`paint`), at `strength(v)` for the band's brightness v:
// into the light map at full strength head-on, darker toward grazing; into the glow map by how much
// brighter than its art a face glows in a strong light.
const drawFaceLight = (c: CanvasRenderingContext2D, bands: FaceBands, paint: CanvasGradient, strength: (v: number) => number) => {
  bands.forEach((quads, band) => {
    if (quads.length === 0) return;
    const v = (band + 0.5) / FACE_BANDS, a = strength(v);
    if (a < 0.01) return; // too faint to see (a flame's glow on its dimmest faces)
    c.beginPath();
    quadsPath(c, quads);
    c.fillStyle = paint;
    c.globalAlpha = a;
    c.fill();
  });
  c.globalAlpha = 1;
}

// Where a direct flashlight beam's centre line hits a wall: the point, how far it is, the wall
// face's direction there, and how squarely the beam hits it (1 = head-on, near 0 = grazing).
const beamWallHit = (group: LightGroup) => {
  if (group.beamAxis === undefined || group.spill || group.depth !== 0) return null;
  const o = group.origin, dx = Math.cos(group.beamAxis), dy = Math.sin(group.beamAxis);
  for (const poly of group.polys) {
    for (let i = 1; i + 1 < poly.length; i++) {
      const a = poly[i], b = poly[i + 1];
      const ex = b.x - a.x, ey = b.y - a.y, denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const wx = a.x - o.x, wy = a.y - o.y;
      const t = (wx * ey - wy * ex) / denom, u = (wx * dy - wy * dx) / denom;
      if (t <= 0 || u < 0 || u > 1) continue;
      const len = Math.hypot(ex, ey) || 1;
      const hit = { x: o.x + dx * t, y: o.y + dy * t, dist: t, faceAngle: Math.atan2(ey, ex), cos: Math.abs(dx * -ey + dy * ex) / len };
      const inside = { x: hit.x + dx * 2, y: hit.y + dy * 2 };
      return levelWalls.some(w => inside.x > w.x && inside.x < w.x + w.w && inside.y > w.y && inside.y < w.y + w.h) ? hit : null;
    }
  }
  return null;
}

// Where the beam's centre hits a wall, the wall itself shows through in a soft spot: the wall's own
// art faded in, and close up also glowing (HOTSPOT_GLOW, into the glow map, fading fast with distance,
// so it's a flashlight pressed to a wall that blazes). The spot is the
// beam's footprint (at least HOTSPOT_MIN_RADIUS, since close up the beam is only a few px across),
// stretched along the wall at a slant as a real beam's spot is (up to HOTSPOT_MAX_STRETCH), and fades
// with distance. Clipped to the level's walls, so it never lights the floor you walk on.
const HOTSPOT_MIN_RADIUS = 0.4 * GRID_SIZE;
const HOTSPOT_BRIGHTNESS = 0.6; // how much of the wall shows at the spot's centre, close up
const HOTSPOT_GLOW = 0.8;
const HOTSPOT_MAX_STRETCH = 2;
const hotspotRadius = (dist: number) => Math.max(HOTSPOT_MIN_RADIUS, dist * Math.tan(FLASHLIGHT_CONE / 2));
const hotspotStretch = (cos: number) => Math.min(HOTSPOT_MAX_STRETCH, 1 / Math.max(cos, 1e-3));
const hotspotLayer = document.createElement('canvas');
const hotspotCtx = hotspotLayer.getContext('2d')!;
const drawBeamHotspot = (c: CanvasRenderingContext2D, group: LightGroup) => {
  const hit = beamWallHit(group);
  if (!hit) return;
  const near = Math.max(0, 1 - hit.dist / FLASHLIGHT_RANGE);
  const alpha = HOTSPOT_BRIGHTNESS * near;
  if (alpha <= 0) return;
  const r = hotspotRadius(hit.dist), stretch = hotspotStretch(hit.cos);

  // The spot's soft shape, then the wall art (lined up with the world) kept only inside it.
  const ext = Math.ceil(r * stretch);
  const ox = Math.floor(hit.x) - ext, oy = Math.floor(hit.y) - ext;
  const h = hotspotCtx;
  hotspotLayer.width = hotspotLayer.height = ext * 2;
  h.save();
  h.translate(hit.x - ox, hit.y - oy);
  h.rotate(hit.faceAngle);
  h.scale(stretch, 1);
  const shape = h.createRadialGradient(0, 0, 0, 0, 0, r);
  shape.addColorStop(0, `rgba(0, 0, 0, ${alpha.toFixed(3)})`);
  shape.addColorStop(1, 'rgba(0, 0, 0, 0)');
  h.fillStyle = shape;
  h.fillRect(-r, -r, r * 2, r * 2);
  h.restore();
  const art = h.createPattern(wallArt, 'no-repeat')!;
  art.setTransform(new DOMMatrix([1, 0, 0, 1, -ox, -oy]));
  h.globalCompositeOperation = 'source-in';
  h.fillStyle = art;
  h.fillRect(0, 0, ext * 2, ext * 2);

  // Trimmed to the walls with the wall mask (cheaper on a phone's GPU than clipping to every wall).
  h.globalCompositeOperation = 'destination-in';
  h.drawImage(wallMask, ox, oy, ext * 2, ext * 2, 0, 0, ext * 2, ext * 2);
  c.drawImage(hotspotLayer, ox, oy); // (only its alpha counts, in the light map)
  glowCtx.globalAlpha = HOTSPOT_GLOW * near ** 3;
  glowCtx.drawImage(hotspotLayer, ox, oy);
  glowCtx.globalAlpha = 1;
  return true;
}

// The remembered floor, cached until the level's layout or anything the player has seen changes.
// Doors and mirrors are drawn as last seen, so fog never shows a change you didn't see.
// The remembered level, as fog shows it: dimMarks is everything but the floorboards (markers,
// plates, levers, lamps, pickups, mirrors, doors, walls) on transparent, which is all fog shows with
// the fog floor off (FOG_VISIBILITY 0); dimFloor is the floorboards with that on top.
const dimMarksCanvas = document.createElement('canvas');
const dimMarksCtx = dimMarksCanvas.getContext('2d')!;
const dimFloorCanvas = document.createElement('canvas');
const dimFloorCtx = dimFloorCanvas.getContext('2d')!;
let dimFloorKey = '';
const ensureDimFloor = () => {
  ensureWallArt();
  const key = JSON.stringify([
    worldCanvas.width, worldCanvas.height, start, goal, levelWalls, doors.map(d => d.seenOpenAmount), lamps,
    lightState.pickups, mirrors.map(m => [m.seenStep, Math.round(m.turned)]), levers.map(l => l.on),
  ]);
  if (key === dimFloorKey) return;
  dimFloorKey = key;
  dimMarksCanvas.width = dimFloorCanvas.width = worldCanvas.width;
  dimMarksCanvas.height = dimFloorCanvas.height = worldCanvas.height;
  drawFloorMarks(dimMarksCtx, true);
  dimMarksCtx.drawImage(dimWallArt, 0, 0);
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  dimFloorCtx.drawImage(dimMarksCanvas, 0, 0);
}

// Memory strength vs. fraction of the light's radius: (1 - t^k)^2, sampled as gradient stops.
const FOG_MEMORY_STOPS: [number, string][] = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const v = Math.round(255 * (1 - t ** FOG_FALLOFF_SHOULDER) ** 2);
  return [t, `rgb(${v},${v},${v})`];
});
// The same, inverted, for the recent memory (which is kept inverted: see fadeMemory).
const FOG_FADE_STOPS: [number, string][] = FOG_MEMORY_STOPS.map(([t, color]) => {
  const v = 255 - Number(color.slice(4, color.indexOf(',')));
  return [t, `rgb(${v},${v},${v})`];
});

// Writes the light in the player's line of sight into fog memory, with the same falloff as the light
// itself, so a spot is remembered only as well as it was seen. Brightness lives in the RGB of an
// opaque canvas because 'lighten' is then an exact per-pixel max (alpha would accumulate instead).
// (Into both memories: the one that keeps, and the one that fades, which is inverted, so there it's
// an exact per-pixel min, 'darken', of the inverted falloff.)
const rememberLight = (groups: LightGroup[], view: Point[][]) => {
  for (const c of [exploredCtx, recentCtx]) {
    const inverted = c === recentCtx;
    c.save();
    c.setTransform(FOG_MEMORY_SCALE, 0, 0, FOG_MEMORY_SCALE, 0, 0);
    polygonsPath(c, view);
    c.clip();
    c.globalCompositeOperation = inverted ? 'darken' : 'lighten';
    for (const g of groups) {
      const gradient = c.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, g.radius);
      for (const [t, color] of inverted ? FOG_FADE_STOPS : FOG_MEMORY_STOPS) gradient.addColorStop(t, color);
      c.fillStyle = gradient;
      polygonsPath(c, g.polys);
      c.fill();
      // Its lit wall and door faces (a fill of their own: a quad wound against the light's outline
      // would cancel it out where they overlap).
      c.beginPath();
      for (const quads of facesOf(g)) quadsPath(c, quads);
      c.fill();
    }
    c.restore();
  }
}

// Memory fades while out of sight: the recent memory drops steadily, from full to nothing in exactly
// MEMORY_FADE_S (whatever's in sight is written back at full each frame, so only what's out of sight
// fades). The mask is 8-bit, and scaling it down (a 'multiply') rounds a dim spot's small drop away,
// so it would never fade out; so the recent memory is kept inverted (white = forgotten), and fading
// is adding ('lighter') whole steps as they add up, which is exact and stops at white. All on the
// GPU: no reading pixels back.
let fadeOwed = 0; // how much the memory should have dropped that hasn't yet (0-255 scale)
const fadeMemory = (dt: number) => {
  fadeOwed += 255 * dt / MEMORY_FADE_S;
  const drop = Math.min(255, Math.floor(fadeOwed));
  if (drop < 1) return;
  fadeOwed -= drop;
  recentCtx.globalCompositeOperation = 'lighter';
  recentCtx.fillStyle = `rgb(${drop},${drop},${drop})`;
  recentCtx.fillRect(0, 0, recentCanvas.width, recentCanvas.height);
  recentCtx.globalCompositeOperation = 'source-over';
}

// Objects are remembered whole, not just the parts your light touched: when one is seen, or one
// you've seen does something (a door swings, locks or unlocks; a mirror turns; a lever is pulled),
// the memory under all of it is set back to full, so it shows complete and starts fading afresh.
// Plates count as seen when their centre is lit and in sight, levers too (or when pulled).
// `level` (0-1) is how well: full unless given.
const rememberWhole = (shape: (c: CanvasRenderingContext2D) => void, level = 1) => {
  const v = Math.round(255 * level);
  for (const c of [exploredCtx, recentCtx]) {
    const inverted = c === recentCtx, shade = inverted ? 255 - v : v;
    c.save();
    c.setTransform(FOG_MEMORY_SCALE, 0, 0, FOG_MEMORY_SCALE, 0, 0);
    c.globalCompositeOperation = inverted ? 'darken' : 'lighten';
    c.fillStyle = c.strokeStyle = `rgb(${shade},${shade},${shade})`;
    shape(c);
    c.restore();
  }
}
const cellShape = (g: GridPos) => (c: CanvasRenderingContext2D) => c.fillRect(g.gridX * GRID_SIZE, g.gridY * GRID_SIZE, GRID_SIZE, GRID_SIZE);
const rememberObjects = (groups: LightGroup[], view: Point[][]) => {
  const seen = (g: GridPos) => { const p = cellCenter(g); return insideAny(p, view) && brightnessAt(p, groups) > 0; };
  for (const m of mirrors) if (m.everSeen && (m.turnLeft > 0 || mirrorSeen(m, groups, view))) rememberWhole(cellShape(m));
  for (const l of levers) {
    if (l.pulled || seen(l)) rememberWhole(cellShape(l));
    l.pulled = false;
  }
  for (const door of doors) {
    if (door.kind !== 'lever' && seen(door.trigger)) rememberWhole(cellShape(door.trigger));
    if (!door.showWhole) continue;
    const level = doorMemoryLevel(door, groups);
    rememberWhole(c => {
      c.lineWidth = DOOR_ART_WIDTH + 8; // a little over, as the low-res memory's edges are soft
      c.beginPath();
      for (const s of doorLeaves(door, door.seenOpenAmount)) { c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); }
      c.stroke();
    }, level);
  }
}
// A door is remembered whole, but only as well as the floor beside it: the memory falloff
// (FOG_MEMORY_STOPS) of the brightest light just off either face of its leaves. Out of light (a door
// you've seen swinging in the dark), as well as when you last saw it. (Remembered at full, a dimly
// lit door's fog copy showed through its light far brighter than the dim floor and walls around it.)
const doorMemory = new WeakMap<DoorState, number>();
const doorMemoryLevel = (door: DoorState, groups: LightGroup[]) => {
  let best = -1;
  for (const s of doorLeaves(door, door.openAmount)) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, off = DOOR_ART_WIDTH / 2 + 2;
    const nx = -(s.y2 - s.y1) / len * off, ny = (s.x2 - s.x1) / len * off;
    for (const f of [0.1, 0.5, 0.9]) for (const side of [1, -1]) {
      const p = { x: s.x1 + (s.x2 - s.x1) * f + nx * side, y: s.y1 + (s.y2 - s.y1) * f + ny * side };
      for (const g of groups) {
        const dist = Math.hypot(p.x - g.origin.x, p.y - g.origin.y);
        if (dist >= g.radius || !insideAny(p, g.polys)) continue; // (out of reach first: it's cheap)
        const t = dist / g.radius;
        best = Math.max(best, (1 - t ** FOG_FALLOFF_SHOULDER) ** 2);
      }
    }
  }
  if (best >= 0) doorMemory.set(door, best);
  return doorMemory.get(door) ?? 1;
}

// What fog shows of each spot: MEMORY_FADE_MIN of how well it was ever seen, and the rest of how
// recently, so remembered things fade after you leave but never all the way.
const memoryMask = document.createElement('canvas');
const memoryMaskCtx = memoryMask.getContext('2d')!;
const MEMORY_EVERY = 2; // frames between fog memory writes (see draw)
let memoryFrames = 0, memoryMaskStale = true;
const buildMemoryMask = () => {
  // (Resized only when the level changes: resizing a canvas reallocates it.)
  if (memoryMask.width !== exploredCanvas.width || memoryMask.height !== exploredCanvas.height) {
    memoryMask.width = exploredCanvas.width;
    memoryMask.height = exploredCanvas.height;
  }
  const m = memoryMaskCtx, w = memoryMask.width, h = memoryMask.height;
  // The recent memory, turned back the right way up: white 'difference' it = 1 - it.
  m.globalCompositeOperation = 'source-over';
  m.fillStyle = '#fff';
  m.fillRect(0, 0, w, h);
  m.globalCompositeOperation = 'difference';
  m.drawImage(recentCanvas, 0, 0);
  if (MEMORY_FADE_MIN > 0) {
    const k = Math.round(255 * (1 - MEMORY_FADE_MIN));
    m.globalCompositeOperation = 'multiply';
    m.fillStyle = `rgb(${k},${k},${k})`;
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = 'lighter';
    m.globalAlpha = MEMORY_FADE_MIN;
    m.drawImage(exploredCanvas, 0, 0);
    m.globalAlpha = 1;
  }
  m.globalCompositeOperation = 'source-over';
  return memoryMask;
}

// Twice the signed area: its sign is the polygon's winding direction.
const signedArea = (poly: Point[]) =>
  poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p.x * q.y - q.x * p.y; }, 0);

// Everything the player can see: in direct line of sight, and in any mirror they can see (the view
// is traced like light, bouncing off mirrors). It stops at wall faces, so points are pushed
// WALL_LIGHT_PENETRATION further along their sight line to keep the lit face band. Every polygon is
// wound the same way: a mirror flips winding, and the view is filled/clipped as one path with the
// nonzero rule, where oppositely wound overlaps would cancel into holes.
// It also sets viewFaces: the wall and door faces in sight, as bands into them (see litFaces).
let viewFaces: Point[][] = [];
const computeView = (scene: Scene): Point[][] => {
  const origin = { x: player.x, y: player.y };
  const range = Math.hypot(worldCanvas.width, worldCanvas.height) * (MAX_MIRROR_BOUNCES + 1);
  const { groups } = castLight(origin, 0, Math.PI * 2, CANDLE_RAY_COUNT, range, scene, MAX_MIRROR_BOUNCES);
  viewFaces = groups.flatMap(g => litFaces(g).flat());
  return groups.flatMap(g =>
    g.polys.map(poly => {
      const pushed = poly.map((p, i) => {
        if (g.depth === 0 && i === 0) return p; // the direct fan's shared corner, at the player
        const dx = p.x - g.origin.x, dy = p.y - g.origin.y, len = Math.hypot(dx, dy) || 1;
        return { x: p.x + dx / len * WALL_LIGHT_PENETRATION, y: p.y + dy / len * WALL_LIGHT_PENETRATION };
      });
      return signedArea(pushed) < 0 ? pushed.reverse() : pushed;
    }));
}

// What the lit layer is cut down to: the line of sight, plus a WALL_LIGHT_PENETRATION band along
// every visible wall face, so a lit face band shows however shallow the angle you see the wall at.
// (The view's own push into walls runs along sight lines, which barely enters a wall seen edge-on.)
const viewMask = document.createElement('canvas');
const viewMaskCtx = viewMask.getContext('2d')!;
const drawViewMask = (view: Point[][], b: Bounds) => {
  if (viewMask.width !== worldCanvas.width || viewMask.height !== worldCanvas.height) {
    viewMask.width = worldCanvas.width;
    viewMask.height = worldCanvas.height;
  }
  viewMaskCtx.clearRect(b.x, b.y, b.w, b.h);
  viewMaskCtx.fillStyle = '#fff';
  polygonsPath(viewMaskCtx, view);
  viewMaskCtx.fill();
  viewMaskCtx.beginPath();
  quadsPath(viewMaskCtx, viewFaces);
  viewMaskCtx.fill();
  return viewMask;
}

// A mirror is seen if any point just off either face, anywhere along it, is lit and in line of sight.
const mirrorSeen = (m: MirrorState, groups: LightGroup[], view: Point[][]) => {
  const seg = mirrorSegment(m, m.shownStep);
  const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const nx = -(seg.y2 - seg.y1) / len * 4, ny = (seg.x2 - seg.x1) / len * 4;
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = seg.x1 + (seg.x2 - seg.x1) * t, y = seg.y1 + (seg.y2 - seg.y1) * t;
    for (const p of [{ x: x + nx, y: y + ny }, { x: x - nx, y: y - ny }]) {
      if (insideAny(p, view) && brightnessAt(p, groups) > 0) return true;
    }
  }
  return false;
}

type Bounds = { x: number; y: number; w: number; h: number };

// A light group's bounding box, padded for the wall-face band (and a beam's wall hotspot) and
// clamped to the world, so light work only touches the area a light actually covers.
const boundsOf = (group: LightGroup): Bounds => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of group.polys) for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const hit = beamWallHit(group);
  const pad = Math.max(WALL_LIGHT_PENETRATION, hit ? hotspotRadius(hit.dist) * hotspotStretch(hit.cos) : 0);
  const x = Math.max(0, Math.floor(minX - pad)), y = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(worldCanvas.width, Math.ceil(maxX + pad)), bottom = Math.min(worldCanvas.height, Math.ceil(maxY + pad));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const copyRect = (to: CanvasRenderingContext2D, from: HTMLCanvasElement, b: Bounds) =>
  to.drawImage(from, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);


// The light map: each light adds how strongly it lights each spot ('lighter', into the alpha of
// litLayer): its polygons at LIT_FLOOR_STRENGTH (the lit floor is blended that much over what's
// beneath it), its wall and door faces at full, all faded by its radial falloff, plus a flashlight's
// hotspot on the wall. Then (see draw) the map is cut to the line of sight and the lit art is laid
// into it ('source-in': art x how lit), once for every light together, rather than each light
// building its own lit copy of the scene, which cost a phone most of its frame.
// A canvas can't store more than full, so the part of a wall's or door's light that goes brighter
// than its art (its glow, and the hotspot's) goes into a second map, glowLayer, laid in the same way
// and added on top. (Strong lights overlapping on the floor are capped at the art's brightness.)
const glowLayer = document.createElement('canvas');
const glowCtx = glowLayer.getContext('2d')!;
let glowDrawn = false; // anything in the glow map this frame
// A group's polygons onto `target` ('lighter'), for one with fades (a beam, light off a mirror):
// filled with its falloff (`fill`) on a scratch layer, then dimmed toward its sides by each fade with
// a conic gradient round its source, since a canvas can't multiply two gradients in one fill.
const beamLayer = document.createElement('canvas');
const beamCtx = beamLayer.getContext('2d')!;
const BEAM_PROFILE_STEPS = 24;
const fillBeam = (target: CanvasRenderingContext2D, group: LightGroup, b: Bounds, fill: CanvasGradient) => {
  if (beamLayer.width !== worldCanvas.width || beamLayer.height !== worldCanvas.height) {
    beamLayer.width = worldCanvas.width;
    beamLayer.height = worldCanvas.height;
  }
  const s = beamCtx, { x, y } = group.origin;
  s.save();
  s.beginPath();
  s.rect(b.x, b.y, b.w, b.h);
  s.clip(); // (also keeps 'destination-in' below from clearing the whole canvas)
  s.clearRect(b.x, b.y, b.w, b.h);
  s.fillStyle = fill;
  polygonsPath(s, group.polys);
  s.fill();
  s.globalCompositeOperation = 'destination-in';
  for (const fade of group.fades ?? []) {
    const across = s.createConicGradient(fade.axis - fade.half, x, y);
    const width = Math.min(1 - 2e-4, 2 * fade.half / (Math.PI * 2)); // its share of the full turn
    for (let i = 0; i <= BEAM_PROFILE_STEPS; i++) {
      const f = i / BEAM_PROFILE_STEPS;
      across.addColorStop(f * width, `rgba(0,0,0,${fadeProfile(Math.abs(2 * f - 1), fade.core)})`);
    }
    across.addColorStop(width + 1e-4, 'rgba(0,0,0,0)');
    s.fillStyle = across;
    s.fillRect(b.x, b.y, b.w, b.h);
  }
  s.restore();
  copyRect(target, beamLayer, b);
}
// A group's soft shadow edges (see addPenumbras) into the light map, with its falloff (`paint`): each
// fan's slices fade from the shadow's edge (full) to nothing (smoothstep). Slices at the same step
// share one fill. A group that fades across (a beam, light off a mirror) dims each fan by the fade
// where its corner is, rounded to PENUMBRA_FADE_LEVELS so fans still share fills.
const PENUMBRA_FADE_LEVELS = 4;
const drawPenumbras = (c: CanvasRenderingContext2D, group: LightGroup, paint: CanvasGradient) => {
  const fans = group.penumbras;
  if (!fans) return;
  const slices = (list: Penumbra[], j: number) => {
    c.beginPath();
    for (const { apex, ends } of list) { c.moveTo(apex.x, apex.y); c.lineTo(ends[j].x, ends[j].y); c.lineTo(ends[j + 1].x, ends[j + 1].y); c.closePath(); }
  };
  const byFade = new Map<number, Penumbra[]>();
  for (const f of fans) {
    const level = group.fades?.length ? Math.round(fadeAt(f.apex, group) * PENUMBRA_FADE_LEVELS) / PENUMBRA_FADE_LEVELS : 1;
    if (level <= 0) continue;
    const list = byFade.get(level);
    if (list) list.push(f); else byFade.set(level, [f]);
  }
  c.fillStyle = paint;
  for (const [across, list] of byFade) {
    for (let j = 0; j < SHADOW_SOFT_STEPS; j++) {
      const u = (j + 0.5) / SHADOW_SOFT_STEPS;
      c.globalAlpha = across * (1 - u * u * (3 - 2 * u));
      slices(list, j);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}
const drawLightMap = (group: LightGroup, b: Bounds) => {
  const c = litCtx;
  for (const x of [c, glowCtx]) {
    x.save();
    x.beginPath();
    x.rect(b.x, b.y, b.w, b.h);
    x.clip();
    x.globalCompositeOperation = 'lighter';
  }
  // A flame's drawn reach and brightness dip as it flickers. (Only drawn: the light itself is steady.)
  const dip = group.flame === undefined ? 0 : flicker(frameTime, group.flame);
  const reach = 1 - FLAME_FLICKER_REACH * dip, bright = 1 - FLAME_FLICKER_BRIGHTNESS * dip;
  const { x, y } = group.origin;
  const falloff = (strength: number, on = c) => {
    const g = on.createRadialGradient(x, y, 0, x, y, group.radius * reach);
    for (const [t, v] of LIGHT_FALLOFF_STOPS) g.addColorStop(t, `rgba(255,255,255,${v * bright * strength})`);
    return g;
  };
  const strength = group.strength ?? 1;
  if (!group.fades?.length) {
    c.fillStyle = falloff(LIT_FLOOR_STRENGTH * strength);
    polygonsPath(c, group.polys);
    c.fill();
  } else fillBeam(c, group, b, falloff(LIT_FLOOR_STRENGTH * strength, beamCtx));
  if (!skip.has('soft')) drawPenumbras(c, group, falloff(LIT_FLOOR_STRENGTH * strength));
  if (!skip.has('faces')) {
    const glow = group.spill ? 0 : group.beamAxis !== undefined ? WALL_GLOW_FLASHLIGHT : WALL_GLOW_FLAME;
    const faces = falloff(strength), glowFaces = falloff(1, glowCtx);
    const bands = facesOf(group);
    drawFaceLight(c, bands, faces, v => 1 - 0.45 * (1 - v));
    drawFaceLight(glowCtx, bands, glowFaces, v => glow * v * v);
    glowDrawn ||= glow > 0;
  }
  if (drawBeamHotspot(c, group)) glowDrawn = true;
  c.restore();
  glowCtx.restore();
}

// The lit art the light map reveals: the floor, floor marks and a warm glow, then the walls' and
// doors' own colours (only their lit faces show). Rebuilt only when something on it changes.
const litArt = document.createElement('canvas');
const litArtCtx = litArt.getContext('2d')!;
let litArtKey = '';
let litArtWalls: Wall[] | null = null;
const ensureLitArt = () => {
  ensureWallArt();
  const key = JSON.stringify([
    worldCanvas.width, worldCanvas.height, start, goal, lamps,
    doors.map(d => [d.openAmount, d.triggerOn, d.opened]), mirrors.map(m => m.shownStep),
    levers.map(l => [l.on, leverFlicking(l)]),
  ]);
  if (key === litArtKey && litArtWalls === levelWalls) return;
  litArtKey = key;
  litArtWalls = levelWalls;
  const c = litArtCtx, w = worldCanvas.width, h = worldCanvas.height;
  if (litArt.width !== w || litArt.height !== h) { litArt.width = w; litArt.height = h; }
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(0, 0, w, h);
  drawFloorMarks(c, false, false);
  // Warmed by multiplying (not adding) a warm colour, so the art keeps its contrast and darks.
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = LIT_FLOOR_TINT;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  c.drawImage(wallArt, 0, 0);
  drawDoors(c, false);
}

// Dust: motes drifting slowly across the whole level, each wandering a little and slowly twinkling.
// Drawn onto the lit area 'source-atop' (see draw), so dust only shows where there's light,
// brightest near it. Scattered afresh for each new level.
type Mote = { x: number; y: number; heading: number; speed: number; phase: number };
let dust: Mote[] = [];
let dustFor: Wall[] | null = null;
const updateDust = (dt: number) => {
  const w = worldCanvas.width, h = worldCanvas.height;
  if (dustFor !== levelWalls) {
    dustFor = levelWalls;
    dust = Array.from({ length: Math.round(w * h / (GRID_SIZE * GRID_SIZE) * DUST_PER_CELL) }, () => ({
      x: Math.random() * w, y: Math.random() * h, heading: Math.random() * Math.PI * 2,
      speed: DUST_SPEED * (0.5 + Math.random()), phase: Math.random() * Math.PI * 2,
    }));
  }
  for (const m of dust) {
    m.heading += (Math.random() - 0.5) * 2 * dt; // a slow random wander
    m.x = (m.x + Math.cos(m.heading) * m.speed * dt + w) % w;
    m.y = (m.y + Math.sin(m.heading) * m.speed * dt + h) % h;
  }
}
const drawDust = (c: CanvasRenderingContext2D, b: Bounds) => {
  for (const m of dust) {
    if (m.x < b.x || m.y < b.y || m.x > b.x + b.w || m.y > b.y + b.h) continue;
    const twinkle = 0.5 + 0.5 * Math.sin(frameTime / DUST_TWINKLE_MS * Math.PI * 2 + m.phase);
    c.fillStyle = `rgba(255, 240, 210, ${(DUST_BRIGHTNESS * twinkle).toFixed(3)})`;
    c.fillRect(Math.round(m.x), Math.round(m.y), DUST_SIZE, DUST_SIZE); // whole pixels, like the art
  }
}

// How far a flame has dipped at `ms`, 0 to 1: smooth random wobble (random values eased between, a
// fast and a slower one) plus two slow sines at unrelated rates, so it never quite repeats.
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const noise = (t: number, seed: number) => {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return hash(i + seed * 57.3) * (1 - u) + hash(i + 1 + seed * 57.3) * u;
};
const flicker = (ms: number, seed: number) => {
  const t = ms / 1000;
  const wobble = noise(t * 5, seed) * 0.75 + noise(t * 10, seed + 11) * 0.25;
  const sway = 0.5 + 0.3 * Math.sin(t * 4.4 + seed) + 0.2 * Math.sin(t * 11.9 + seed * 2.3);
  return Math.min(1, Math.max(0, wobble * 0.65 + sway * 0.35));
}

// The 'bright' view: the whole level as if lit, with doors as they are.
const drawBrightLevel = (c: CanvasRenderingContext2D) => {
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawFloorMarks(c, false);
  ensureWallArt();
  c.drawImage(wallArt, 0, 0);
}

// One light's reach as a flat tint, faded by its falloff, onto regionLayer.
const drawLightTint = (group: LightGroup, b: Bounds) => {
  const c = regionCtx;
  c.clearRect(b.x, b.y, b.w, b.h);
  c.fillStyle = group.beamAxis !== undefined ? 'rgb(90, 200, 255)' : 'rgb(255, 200, 90)';
  polygonsPath(c, group.polys);
  c.fill();
  c.globalCompositeOperation = 'destination-in';
  const { x, y } = group.origin;
  const falloff = c.createRadialGradient(x, y, 0, x, y, group.radius);
  for (const [t, v] of LIGHT_FALLOFF_STOPS) falloff.addColorStop(t, `rgba(255,255,255,${v})`);
  c.fillStyle = falloff;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.globalCompositeOperation = 'source-over';
}

// A held light shines from where it is in the player sprite. That reaches past your footprint, so up
// against a wall or mirror it's pulled back to just in front of it, never through. The flashlight's
// beam fills its lens: it starts far enough behind the lens (inside the arm, under the sprite) to be
// exactly lens-wide there.
const heldLightSource = (kind: LightKind, scene: Scene): Point => {
  const sprite = PLAYER_SPRITES[kind];
  const fx = (sprite.light.x - sprite.anchor.x) * PLAYER_SPRITE_SCALE;
  const fy = (sprite.light.y - sprite.anchor.y) * PLAYER_SPRITE_SCALE;
  const cos = Math.cos(player.aimAngle), sin = Math.sin(player.aimAngle);
  const aimed = { x: player.x + fx * cos - fy * sin, y: player.y + fx * sin + fy * cos };
  const reach = Math.hypot(fx, fy);
  const k = reach === 0 ? 0 : Math.max(0, Math.min(reach, clearDistance(scene, player, aimed) - 1)) / reach;
  const lens = { x: player.x + (aimed.x - player.x) * k, y: player.y + (aimed.y - player.y) * k };
  if (kind !== 'flashlight') return lens;

  const fullBack = PLAYER_SPRITES.flashlight.lensHalfHeight * PLAYER_SPRITE_SCALE / Math.tan(FLASHLIGHT_CONE / 2);
  const behind = { x: lens.x - cos * fullBack, y: lens.y - sin * fullBack };
  const back = Math.max(0, Math.min(fullBack, clearDistance(scene, lens, behind) - 1));
  return { x: lens.x - cos * back, y: lens.y - sin * back };
}

// Every light this frame: the one in hand, dropped ones, the level's lamps. The player's lights
// ignite at level start; lamps are already burning.
const castAllLights = (scene: Scene, now: number) => {
  const ignite = Math.min(1, Math.max(0, (now - gameState.startedAt) / LIGHT_IGNITE_MS));
  const grow = 1 - (1 - ignite) ** 3;
  const range = (kind: LightKind) => (kind === 'flashlight' ? FLASHLIGHT_RANGE : CANDLE_RADIUS) * grow;

  // `seed` keeps each flame's flicker its own, and steady from frame to frame.
  const sources: { kind: LightKind; at: Point; aim: number; radius: number; seed: number }[] = [];
  if (lightState.held) {
    sources.push({ kind: lightState.held, at: heldLightSource(lightState.held, scene), aim: player.aimAngle, radius: range(lightState.held), seed: 1 });
  }
  for (const d of lightState.dropped) {
    // A dropped flashlight shines from its handle end, so its own cell is inside the beam, but never
    // from behind a wall, door or mirror it's been put down against.
    const cos = Math.cos(d.aimAngle), sin = Math.sin(d.aimAngle);
    const fullBack = d.kind === 'flashlight' ? FLASHLIGHT_BACK * GRID_SIZE : 0;
    const back = fullBack && Math.max(0, Math.min(fullBack, clearDistance(scene, d, { x: d.x - cos * fullBack, y: d.y - sin * fullBack }) - 1));
    sources.push({ kind: d.kind, at: { x: d.x - cos * back, y: d.y - sin * back }, aim: d.aimAngle, radius: range(d.kind), seed: 100 + d.gridX * 31 + d.gridY * 17 });
  }
  for (const l of lamps) {
    const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT_EDGE_GAP;
    sources.push({ kind: 'candle', at: { x: c.x + l.toWallX * out, y: c.y + l.toWallY * out }, aim: 0, radius: LAMP_RADIUS, seed: 500 + l.gridX * 31 + l.gridY * 17 });
  }

  const groups: LightGroup[] = [];
  let rayCount = 0;
  for (const s of sources) {
    const radius = Math.max(1, s.radius);
    const result = s.kind === 'flashlight'
      ? castFlashlight(s.at, s.aim, radius, scene, !skip.has('soft'))
      : castLight(s.at, 0, Math.PI * 2, CANDLE_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES, true, !skip.has('soft'));
    if (s.kind !== 'flashlight') for (const g of result.groups) g.flame = s.seed;
    groups.push(...result.groups);
    rayCount += result.rayCount;
  }
  return { groups, rayCount, lightCount: sources.length };
}

// The camera centres on the player (plus any two-finger pan), clamped to the level's edges; along an
// axis where the level is smaller than the screen, it's centred. It glides to a new zoom over
// ZOOM_EASE_MS (eased), smoothed on the way and crisp again once it's there; mid-pinch it follows
// your fingers exactly. `dt` in seconds.
let zoomFrom = 0, zoomTo = 0, zoomMs = 0;
const screenView = { zoom: 1, x: 0, y: 0 }; // the world-to-screen transform last drawn with, in canvas px
// The world point under a point on the page (CSS px, e.g. a tap), as last drawn.
export const screenToWorld = (clientX: number, clientY: number): Point => ({
  x: (clientX * pixelRatio - screenView.x) / screenView.zoom,
  y: (clientY * pixelRatio - screenView.y) / screenView.zoom,
});
// Mid-glide, the camera heads straight from where it was to where it'll be at the new zoom (following
// the player there), in step with the zoom: its progress goes by 1/zoom, the view's size, so the view
// shrinks (or grows) toward its end evenly and never shows past the level's edges on the way.
let glideLength = ZOOM_EASE_MS; // this glide's length (a new level's zoom-in is slower)
let camFrom = { x: 0, y: 0 }, lastCam = { x: 0, y: 0 };
let smoothScreen = false; // this frame's camera is mid-glide or pinch, or below 1x: draw it smoothed
const updateCamera = (dt: number) => {
  const target = camera.zoom = clampZoom(camera.zoom, camera.pinching);
  if (camera.pinching) { zoomFrom = zoomTo = target; zoomMs = glideLength = ZOOM_EASE_MS; }
  if (target !== zoomTo) {
    const first = !zoomTo; // (the very first frame of a level starts there)
    zoomFrom = first ? target : currentZoom();
    zoomTo = target;
    zoomMs = 0;
    glideLength = camera.glideMs ?? ZOOM_EASE_MS;
    camera.glideMs = null;
    camFrom = lastCam;
    if (first) zoomMs = glideLength;
  }
  zoomMs += dt * 1000;
  const settled = zoomMs >= glideLength;
  const zoom = currentZoom();
  const follow = (pos: number, worldSize: number, screenSize: number, z: number) => {
    const half = screenSize / 2 / z;
    return worldSize <= half * 2 ? worldSize / 2 : Math.min(worldSize - half, Math.max(half, pos));
  };
  let camX = follow(player.x + camera.panX, worldCanvas.width, canvas.width, settled ? zoom : zoomTo);
  let camY = follow(player.y + camera.panY, worldCanvas.height, canvas.height, settled ? zoom : zoomTo);
  if (!settled && zoomFrom !== zoomTo) {
    const w = (1 / zoomFrom - 1 / zoom) / (1 / zoomFrom - 1 / zoomTo);
    camX = camFrom.x + (camX - camFrom.x) * w;
    camY = camFrom.y + (camY - camFrom.y) * w;
  }
  lastCam = { x: camX, y: camY };
  // Mid-gesture, the pan stops where the view does at the level's edges, so dragging back moves it at once.
  if (camera.pinching) { camera.panX = camX - player.x; camera.panY = camY - player.y; }
  // Whole-pixel offsets and no smoothing zoomed in, so art pixels land exactly on screen pixels and
  // don't shimmer as the camera moves. Zoomed out below 1x the art has to shrink, so it's smoothed.
  smoothScreen = zoom < 1 || !settled || camera.pinching;
  Object.assign(screenView, { zoom, x: Math.round(canvas.width / 2 - camX * zoom), y: Math.round(canvas.height / 2 - camY * zoom) });
}

// The part of the world on screen this frame (padded a little, lined up with the fog memory's
// pixels, and clamped to the world): only it needs drawing.
const visibleRect = (): Bounds => {
  const step = 1 / FOG_MEMORY_SCALE, pad = 2;
  const x0 = Math.max(0, Math.floor((-screenView.x / screenView.zoom - pad) / step) * step);
  const y0 = Math.max(0, Math.floor((-screenView.y / screenView.zoom - pad) / step) * step);
  const x1 = Math.min(worldCanvas.width, Math.ceil(((canvas.width - screenView.x) / screenView.zoom + pad) / step) * step);
  const y1 = Math.min(worldCanvas.height, Math.ceil(((canvas.height - screenView.y) / screenView.zoom + pad) / step) * step);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
const intersect = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

// The world canvas onto the screen, through this frame's camera (updateCamera).
const drawToScreen = () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = smoothScreen;
  ctx.setTransform(screenView.zoom, 0, 0, screenView.zoom, screenView.x, screenView.y);
  ctx.drawImage(worldCanvas, 0, 0);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); // on-screen text is sized in CSS px
}
const currentZoom = () => zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomMs / glideLength));
// Jump to the next zoom instead of gliding there (a new level, behind the fade).
export const snapZoom = () => { zoomTo = 0; };

// The Level Complete card, at `alpha`: the title, then room for a flame (to come: a candle flickering
// beneath the title), then the prompt.
const CARD_FLAME_SPACE = 110; // px (CSS) kept clear between the title and the prompt
const drawLevelComplete = (alpha: number) => {
  const w = canvas.width / pixelRatio, h = canvas.height / pixelRatio;
  const titleY = h / 2 - CARD_FLAME_SPACE / 2 - 12, promptY = h / 2 + CARD_FLAME_SPACE / 2 + 24;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('Level Complete', w / 2, titleY);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px sans-serif';
  ctx.fillText(input.touch ? 'Tap to continue' : 'Press Enter to continue', w / 2, promptY);
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
}

// Level transitions: once you reach the exit, the world dims and the card fades in (see main.ts for
// leaving and arriving). Then the screen's darkness and the card go over everything.
let winShown = false;
const drawTransition = (now: number) => {
  if (gameState.status === 'won' && !winShown) {
    winShown = true;
    screenDark.go(WIN_DIM, WIN_FADE_MS);
    cardShown.go(1, CARD_FADE_MS, null, WIN_FADE_MS / 2);
  }
  if (gameState.status !== 'won') winShown = false;
  const w = canvas.width / pixelRatio, h = canvas.height / pixelRatio;
  const dark = screenDark.valueAt(now), card = cardShown.valueAt(now);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${dark.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (card > 0) drawLevelComplete(card);
}

export const draw = (now: number) => {
  requestAnimationFrame(draw);

  // Frame cap. The 1ms slack stops rAF timing jitter from skipping a frame we wanted.
  const elapsed = now - lastFrameTime;
  if (elapsed < FRAME_INTERVAL - 1) return;
  const dt = Math.min(elapsed, 100) / 1000; // clamped so a backgrounded tab doesn't teleport the player
  lastFrameTime = now;
  frameTime = now;
  fpsFrames++;
  if (now - fpsWindowStart >= 1000) {
    fps = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
    fpsFrames = 0;
    fpsWindowStart = now;
  }

  perfFrameStart();
  const walkAngle = tryMove(dt, litGroupsHeld === lightState.held ? litGroups : []);
  updateAim(dt, walkAngle);
  // Walking brings a panned view back to you.
  if (walkAngle !== null && !camera.pinching) {
    const keep = Math.exp(-CAMERA_PAN_RETURN * dt);
    camera.panX *= keep;
    camera.panY *= keep;
  }
  // Ease into idling once you stop walking, and out of it as soon as you move.
  const idleStep = dt * 1000 / IDLE_FADE_MS;
  idle = walkAngle === null ? Math.min(1, idle + idleStep) : Math.max(0, idle - idleStep);
  updateMirrors(dt);
  updateDust(dt);
  perfMark('move');

  const scene = getScene(levelWalls, mirrors, allDoorLeaves());
  const { groups, rayCount, lightCount } = castAllLights(scene, now);
  perfMark('cast');
  litGroups = groups;
  litGroupsHeld = lightState.held;

  // Light exists everywhere it reaches (the fear rule and plates use all of it), but the player
  // only sees, and remembers, what's in line of sight.
  const view = computeView(scene);
  perfMark('view');
  updateDoors(groups, view, dt);
  for (const m of mirrors) if (mirrorSeen(m, groups, view)) { m.seenStep = m.shownStep; m.everSeen = true; }
  if (viewMode !== 'normal') {
    for (const d of doors) d.seenOpenAmount = d.openAmount;
    for (const m of mirrors) m.seenStep = m.shownStep;
  }
  perfMark('logic');
  fadeMemory(dt);
  perfMark('fade');
  // Fog memory is written (and its mask rebuilt) every MEMORY_EVERY frames: fog only changes as
  // things fade, and what's lit is drawn fresh over it every frame anyway.
  const memoryFrame = memoryFrames++ % MEMORY_EVERY === 0;
  if (memoryFrame) memoryMaskStale = true;
  if (memoryFrame && !skip.has('memory')) {
    rememberLight(groups, view);
    rememberObjects(groups, view);
  }
  if (viewMode === 'fog') {
    for (const c of [exploredCtx, recentCtx]) {
      c.fillStyle = c === recentCtx ? '#000' : '#fff'; // everything remembered (the recent memory is inverted)
      c.fillRect(0, 0, exploredCanvas.width, exploredCanvas.height);
    }
  }
  perfMark('memory');
  updateCamera(dt);
  const vis = visibleRect();

  // Lights are only drawn where they're on screen (they still light the whole level for play).
  const bounds = groups.map(g => intersect(boundsOf(g), vis));
  const onScreen = groups.map((_, i) => bounds[i].w > 0 && bounds[i].h > 0);
  const litBounds = bounds.filter((_, i) => onScreen[i]).reduce(unionBounds, { x: vis.x, y: vis.y, w: 0, h: 0 });
  litCtx.clearRect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
  if (glowLayer.width !== worldCanvas.width || glowLayer.height !== worldCanvas.height) {
    glowLayer.width = worldCanvas.width;
    glowLayer.height = worldCanvas.height;
  }
  glowCtx.clearRect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
  glowDrawn = false;
  if (viewMode === 'bright') {
    // Everything fully lit, and each light's reach as a tinted overlay, fading with its falloff.
    drawBrightLevel(worldCtx);
    litCtx.globalCompositeOperation = 'lighter';
    groups.forEach((g, i) => { if (onScreen[i]) { drawLightTint(g, bounds[i]); copyRect(litCtx, regionLayer, bounds[i]); } });
    litCtx.globalCompositeOperation = 'source-over';
    worldCtx.globalAlpha = 0.55;
    copyRect(worldCtx, litLayer, litBounds);
    worldCtx.globalAlpha = 1;
  } else {
    // Remembered floor: dim floor x fog memory (upscaled, which softens its edges), plus the base
    // darkness added on top (a max would erase the faint end of the fade).
    // The dim floor is drawn at FOG_FLOOR_BRIGHTNESS; scaling it by this takes it (and everything
    // remembered on it) to FOG_VISIBILITY. At 0 there's no fog floor: everything else you've seen
    // (wall edges, plates, levers, mirrors, doors...) stays remembered as usual, and the floorboards
    // show only while lit and in sight. (The playtest
    // fog view, there to show the whole level, always draws the fog floor.)
    const fog = viewMode === 'fog' ? FOG_FLOOR_BRIGHTNESS : FOG_VISIBILITY;
    ensureDimFloor();
    // (Only the part on screen: the rest of the world canvas is never shown.)
    const S = FOG_MEMORY_SCALE;
    worldCtx.fillStyle = 'black';
    worldCtx.fillRect(vis.x, vis.y, vis.w, vis.h);
    if (!skip.has('fog')) {
      worldCtx.globalAlpha = fog > 0 ? Math.min(1, fog / FOG_FLOOR_BRIGHTNESS) : 1;
      copyRect(worldCtx, fog > 0 ? dimFloorCanvas : dimMarksCanvas, vis);
      worldCtx.globalAlpha = 1;
      worldCtx.globalCompositeOperation = 'multiply';
      if (memoryMaskStale || memoryMask.width !== exploredCanvas.width || memoryMask.height !== exploredCanvas.height) buildMemoryMask();
      memoryMaskStale = false;
      worldCtx.drawImage(memoryMask, vis.x * S, vis.y * S, vis.w * S, vis.h * S, vis.x, vis.y, vis.w, vis.h);
      worldCtx.globalCompositeOperation = 'lighter';
      worldCtx.fillStyle = '#141110';
      worldCtx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    worldCtx.globalCompositeOperation = 'source-over';
    perfMark('fog');

    // Lit regions are added together ('lighter'), since overlapping light adds, then cut down to the
    // line of sight (in the game) and drawn over the remembered floor.
    litCtx.globalCompositeOperation = 'lighter';
    if (!skip.has('lit')) groups.forEach((g, i) => { if (onScreen[i]) drawLightMap(g, bounds[i]); });
    perfMark('lit');
    if (viewMode === 'normal' && litBounds.w > 0 && litBounds.h > 0 && !skip.has('sight')) {
      // (Kept to the lit area: 'destination-in' would otherwise clear the whole canvas outside it.)
      litCtx.save();
      litCtx.beginPath();
      litCtx.rect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
      litCtx.clip();
      litCtx.globalCompositeOperation = 'destination-in';
      const mask = drawViewMask(view, litBounds);
      copyRect(litCtx, mask, litBounds);
      litCtx.restore();
      if (glowDrawn) {
        glowCtx.save();
        glowCtx.beginPath();
        glowCtx.rect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
        glowCtx.clip();
        glowCtx.globalCompositeOperation = 'destination-in';
        copyRect(glowCtx, mask, litBounds);
        glowCtx.restore();
      }
    }
    // The lit art laid into the light map, and dust on it, then the lot over the remembered floor.
    if (litBounds.w > 0 && litBounds.h > 0 && !skip.has('floor')) {
      ensureLitArt();
      litCtx.save();
      litCtx.beginPath();
      litCtx.rect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
      litCtx.clip(); // ('source-in' would otherwise clear the whole canvas outside it)
      litCtx.globalCompositeOperation = 'source-in';
      copyRect(litCtx, litArt, litBounds);
      litCtx.globalCompositeOperation = 'source-atop';
      drawDust(litCtx, litBounds);
      litCtx.restore();
    }
    litCtx.globalCompositeOperation = 'source-over';
    copyRect(worldCtx, litLayer, litBounds);
    // The glow: the lit art laid into the glow map, added on top.
    if (glowDrawn && litBounds.w > 0 && litBounds.h > 0 && !skip.has('floor')) {
      glowCtx.save();
      glowCtx.beginPath();
      glowCtx.rect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
      glowCtx.clip();
      glowCtx.globalCompositeOperation = 'source-in';
      copyRect(glowCtx, litArt, litBounds);
      glowCtx.restore();
      worldCtx.globalCompositeOperation = 'lighter';
      copyRect(worldCtx, glowLayer, litBounds);
      worldCtx.globalCompositeOperation = 'source-over';
    }
    perfMark('sight');
  }

  drawLockFlashes(worldCtx);
  drawAwakePlates(view);
  if (!skip.has('objects')) drawObjects(view, groups);
  perfMark('objects');

  if (!skip.has('screen')) drawToScreen();
  else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); }
  drawTransition(now);
  perfMark('screen');
  perfFrameEnd();
  drawHud(rayCount, lightCount, groups.length);
}

// Lit plates in line of sight wake (over PLATE_MID_MS) into their door's kind of mid, drawn over
// the darkness at full art rather than as lit as the floor, so they shine. Going dark they wink
// out: shift to dead (still shining), flare, and fade into the dark.
const drawAwakePlates = (view: Point[][]) => {
  const c = worldCtx;
  for (const door of doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger), mid: ObjectKind = door.kind === 'locked' ? 'plateMidLock' : 'plateMidStd';
    const wink = frameTime - door.winkAt, winking = wink < PLATE_WINK_SHIFT_MS + PLATE_WINK_FLARE_MS + PLATE_WINK_FADE_MS;
    if (door.plateWake === 0 && !winking) continue;
    if (viewMode === 'normal' && !insideAny(at, view)) continue;
    if (door.plateWake > 0) {
      c.globalAlpha = door.plateWake / PLATE_MID_MS;
      drawObject(c, mid, at.x, at.y, 0, false);
      continue;
    }
    const from = door.winkFrom;
    if (wink < PLATE_WINK_SHIFT_MS) {
      c.globalAlpha = from;
      drawObject(c, 'plateDead', at.x, at.y, 0, false);
      c.globalAlpha = from * (1 - wink / PLATE_WINK_SHIFT_MS);
      drawObject(c, mid, at.x, at.y, 0, false);
      continue;
    }
    const t = wink - PLATE_WINK_SHIFT_MS;
    c.globalAlpha = from * (t < PLATE_WINK_FLARE_MS ? 1 : 1 - (t - PLATE_WINK_FLARE_MS) / PLATE_WINK_FADE_MS);
    drawObject(c, 'plateDead', at.x, at.y, 0, false);
    if (t < PLATE_WINK_FLARE_MS) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = from * PLATE_WINK_FLARE * Math.sin(Math.PI * t / PLATE_WINK_FLARE_MS);
      drawObject(c, 'plateDead', at.x, at.y, 0, false);
      c.globalCompositeOperation = 'source-over';
    }
  }
  c.globalAlpha = 1;
}

// Dropped lights in line of sight, lights waiting to be found where they're lit and in sight (at
// full art, the same as a dropped one, so they stand out), then the player.
const drawObjects = (view: Point[][], groups: LightGroup[]) => {
  for (const d of lightState.dropped) {
    if (viewMode === 'normal' && !insideAny(d, view)) continue;
    drawObject(worldCtx, d.kind, d.x, d.y, d.kind === 'flashlight' ? d.aimAngle : 0, false);
  }
  for (const p of lightState.pickups) {
    if (viewMode === 'normal' && !(insideAny(p, view) && brightnessAt(p, groups) > 0)) continue;
    drawObject(worldCtx, p.kind, p.x, p.y, p.aimAngle, false);
  }
  const spriteKind = lightState.held ?? 'empty';
  const { anchor } = PLAYER_SPRITES[spriteKind];
  worldCtx.save();
  // Idling: a slow breath (a slight swell) or bob, eased in and out (smoothstep of `idle`).
  const wave = Math.sin(frameTime / IDLE_PERIOD_MS * Math.PI * 2) * idle * idle * (3 - 2 * idle);
  const swell = IDLE_STYLE === 'breathe' ? 1 + IDLE_BREATHE * (wave + 1) / 2 : 1;
  worldCtx.translate(player.x, player.y + (IDLE_STYLE === 'bob' ? IDLE_BOB * wave : 0));
  worldCtx.rotate(player.aimAngle);
  const pop = swell * punchScale('player');
  worldCtx.scale(PLAYER_SPRITE_SCALE * pop, PLAYER_SPRITE_SCALE * pop);
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.drawImage(playerSprites[spriteKind], -anchor.x, -anchor.y);
  worldCtx.restore();
  drawShines(worldCtx);
}

// The fps line (and, with ?perf, the timings) over the screen: only with ?fps or ?perf, or in the
// editor's playtest.
const showHud = params.has('fps') || perfParam !== null || params.has('playtest');
const drawHud = (rayCount: number, lightCount: number, groupCount: number) => {
  if (!showHud) return;
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${lightCount} lights · ${groupCount} light groups`, 8, 16);
  if (perfText) {
    // Wrapped to the screen's width, so it all shows on a phone.
    const maxW = canvas.width / pixelRatio - 16;
    let y = viewMode !== 'normal' ? 48 : 32, line = '';
    for (const part of perfText.split(' · ')) {
      const next = line ? `${line} · ${part}` : part;
      if (line && ctx.measureText(next).width > maxW) { ctx.fillText(line, 8, y); y += 16; line = part; }
      else line = next;
    }
    ctx.fillText(line, 8, y);
  }
  if (viewMode !== 'normal') ctx.fillText(`playtest · ${viewMode} view (V to switch) · R restarts`, 8, 32);
}
