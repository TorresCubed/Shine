import { polygonsPath, cellCenter, mirrorSegment } from "./util";
import { tryMove, updateAim, updateMirrors } from "./playerLogic";
import { getScene } from "./scene";
import { castLight, insideAny, brightnessAt, clearDistance } from "./rayTracer";
import type { LightGroup } from "./rayTracer";
import type { LightKind, Point, Scene, Wall } from "./interfaces";
import { updateDoors } from "./doorLogic";
import {
  CANDLE_RADIUS, LAMP_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE, MAX_MIRROR_BOUNCES, GRID_SIZE, TARGET_FPS,
  CANDLE_RAY_COUNT, FLASHLIGHT_RAY_COUNT, FOG_MEMORY_SCALE, FOG_FALLOFF_SHOULDER, FOG_FLOOR_BRIGHTNESS,
  LIGHT_IGNITE_MS, WALL_LIGHT_PENETRATION, LIGHT_FALLOFF_STOPS, MIRROR_THICKNESS, PLAYER_SPRITES,
  PLAYER_SPRITE_SCALE,
} from "./consts";
import { player, walls, levelWalls, doors, doorPanels, lamps, mirrors, levers, lightState, start, goal, gameState, camera } from "./state";
import type { DoorState, MirrorState } from "./state";
import { canvas, ctx, clampZoom, pixelRatio, worldCanvas, worldCtx, exploredCanvas, exploredCtx, litLayer, litCtx, regionLayer, regionCtx } from "./main";

const FRAME_INTERVAL = 1000 / TARGET_FPS;
const LIGHT_EDGE_GAP = 0.04 * GRID_SIZE;       // wall lamps shine from this far off the wall face, so rays never start on it
const FLASHLIGHT_BACK = 0.28;   // a dropped flashlight shines from its handle end, this far (in cells) behind centre

let lastFrameTime = -Infinity;
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;
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
  const [floor, wall, ...sprites] = await Promise.all([
    loadImage(assetUrls['floorboards.png']),
    loadImage(assetUrls['walls.png']),
    ...kinds.map(k => loadImage(assetUrls[PLAYER_SPRITES[k].file])),
  ]);
  kinds.forEach((k, i) => playerSprites[k] = sprites[i]);
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

  wallArt.width = dimWallArt.width = worldCanvas.width;
  wallArt.height = dimWallArt.height = worldCanvas.height;
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

// A door's colour through the same grayscale + FOG_FLOOR_BRIGHTNESS (0.45) as the dim tiles.
const DOOR_DIM_COLOR = '#282828';

// Light doors are wood, lever doors iron; locked doors are red while locked, green once unlocked.
const doorColor = (door: DoorState) => {
  if (door.kind === 'light') return '#7a5230';
  if (door.kind === 'lever') return '#5a6270';
  return door.triggerOn || door.opened ? '#4f8a3a' : '#8a2e24';
}

const drawFlashlight = (c: CanvasRenderingContext2D, x: number, y: number, angle: number, on: boolean, dim: boolean) => {
  const G = GRID_SIZE;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.fillStyle = dim ? '#2e2e2e' : '#3b3f46';
  c.fillRect(-FLASHLIGHT_BACK * G, -0.07 * G, 0.4 * G, 0.14 * G); // handle
  c.fillStyle = dim ? '#3a3a3a' : '#555b64';
  c.fillRect(0.12 * G, -0.12 * G, 0.14 * G, 0.24 * G);             // head
  c.fillStyle = dim ? '#7a7a7a' : on ? '#fff6c8' : '#9aa3ab';
  c.fillRect(0.26 * G, -0.1 * G, 0.04 * G, 0.2 * G);               // lens
  c.restore();
}

// Everything that belongs to the floor (markers, lamps, plates, levers, unfound lights, mirrors) is
// painted into both the lit and the remembered floor, so it's hidden in darkness and remembered in
// fog like the floor itself. `dim` picks the fog palette, and draws mirrors as last seen.
const drawFloorMarks = (c: CanvasRenderingContext2D, dim: boolean) => {
  c.lineWidth = 0.06 * GRID_SIZE;

  const s = cellCenter(start);
  c.strokeStyle = dim ? '#6e6e6e' : '#e8e0d0';
  c.beginPath();
  c.arc(s.x, s.y, GRID_SIZE * 0.35, 0, Math.PI * 2);
  c.stroke();

  const g = cellCenter(goal), r = GRID_SIZE * 0.3;
  c.strokeStyle = dim ? '#777' : '#f5c542';
  c.beginPath();
  c.moveTo(g.x, g.y - r);
  c.lineTo(g.x + r, g.y);
  c.lineTo(g.x, g.y + r);
  c.lineTo(g.x - r, g.y);
  c.closePath();
  c.stroke();

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

  for (const p of lightState.pickups) {
    const at = cellCenter(p);
    drawFlashlight(c, at.x, at.y, p.aimAngle, false, dim);
  }

  // Plates: a dark recessed tile while idle, a cool cyan glow while lit.
  for (const door of doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger), half = GRID_SIZE * 0.3, active = !dim && door.triggerOn;
    c.fillStyle = dim ? '#3a3a3a' : active ? '#8fe3ff' : '#2a2622';
    c.fillRect(at.x - half, at.y - half, half * 2, half * 2);
    c.strokeStyle = dim ? '#6a6a6a' : active ? '#e0f8ff' : '#8a8378';
    c.strokeRect(at.x - half, at.y - half, half * 2, half * 2);
  }

  // Levers: a round base and a handle thrown left (off) or right (on).
  for (const l of levers) {
    const at = cellCenter(l);
    const angle = l.on ? -Math.PI / 4 : -3 * Math.PI / 4, len = GRID_SIZE * 0.32;
    const tipX = at.x + Math.cos(angle) * len, tipY = at.y + Math.sin(angle) * len;
    c.fillStyle = dim ? '#3a3a3a' : '#4a4f58';
    c.beginPath();
    c.arc(at.x, at.y, GRID_SIZE * 0.16, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = dim ? '#6a6a6a' : '#c9ced6';
    c.beginPath();
    c.moveTo(at.x, at.y);
    c.lineTo(tipX, tipY);
    c.stroke();
    c.fillStyle = dim ? '#7a7a7a' : '#d9534f';
    c.beginPath();
    c.arc(tipX, tipY, 0.08 * GRID_SIZE, 0, Math.PI * 2);
    c.fill();
  }

  // Mirrors, with a pivot showing what turns them: round = you can, square = a lever, none = fixed.
  for (const m of mirrors) {
    const seg = mirrorSegment(m, dim ? m.seenStep : m.shownStep), at = cellCenter(m), pivot = 0.1 * GRID_SIZE;
    c.lineWidth = MIRROR_THICKNESS;
    c.strokeStyle = dim ? '#8a8a8a' : '#dff2ff';
    c.beginPath();
    c.moveTo(seg.x1, seg.y1);
    c.lineTo(seg.x2, seg.y2);
    c.stroke();
    if (m.control === 'fixed') continue;
    c.fillStyle = dim ? '#5a5a5a' : '#8a93a0';
    c.beginPath();
    if (m.control === 'turnable') c.arc(at.x, at.y, pivot, 0, Math.PI * 2);
    else c.rect(at.x - pivot, at.y - pivot, pivot * 2, pivot * 2);
    c.fill();
  }
}

// Light polygons end exactly on the wall faces they hit. Stroking their outline, clipped to the
// walls, paints a band WALL_LIGHT_PENETRATION px deep into just the faces the light reaches. Round
// joins: a flashlight wedge's sharp tip would otherwise get a miter spike reaching ~5x the band
// width behind it, into the wall at your back.
const strokeWallFaces = (c: CanvasRenderingContext2D, polygons: Point[][], style: string | CanvasGradient, rects: Wall[]) => {
  if (rects.length === 0) return;
  c.save();
  c.beginPath();
  for (const w of rects) c.rect(w.x, w.y, w.w, w.h);
  c.clip();
  c.strokeStyle = style;
  c.lineJoin = 'round';
  c.lineWidth = WALL_LIGHT_PENETRATION * 2;
  polygonsPath(c, polygons);
  c.stroke();
  c.restore();
}

// Lit wall faces, shaded by how squarely the light hits them (a face lit head-on is brighter than one
// it grazes) and, for a flashlight, by the beam's profile (brightest along its centre line, fading
// to its edges), from 55% up to the paint's own brightness, never past it. Distance is handled by
// the caller's falloff. Edges are sorted into a few brightness bands so it's a handful of strokes,
// not one per edge.
const FACE_BANDS = 6;
const strokeLitFaces = (c: CanvasRenderingContext2D, group: LightGroup, paint: string | CanvasPattern, rects: Wall[]) => {
  if (rects.length === 0) return;
  const bands: [Point, Point][][] = Array.from({ length: FACE_BANDS }, () => []);
  for (const poly of group.polys) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      if (group.depth === 0 && (i === 0 || j === 0)) continue; // the fan's sides, out from the light
      const a = poly[i], b = poly[j];
      const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
      if (len < 0.5) continue;
      const mx = (a.x + b.x) / 2 - group.origin.x, my = (a.y + b.y) / 2 - group.origin.y;
      const cos = Math.abs(mx * -ey + my * ex) / (len * (Math.hypot(mx, my) || 1)); // incidence vs. the face
      let beam = 1;
      if (group.beamAxis !== undefined) {
        const off = Math.atan2(my, mx) - group.beamAxis;
        const t = Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) / (FLASHLIGHT_CONE / 2);
        beam = Math.max(0, 1 - t * t);
      }
      // sqrt softens the fall-off toward grazing angles, so a wall lit along its length doesn't
      // drop to a dark line.
      bands[Math.min(FACE_BANDS - 1, Math.floor(Math.sqrt(cos) * beam * FACE_BANDS))].push([a, b]);
    }
  }

  c.save();
  c.beginPath();
  for (const w of rects) c.rect(w.x, w.y, w.w, w.h);
  c.clip();
  c.lineWidth = WALL_LIGHT_PENETRATION * 2;
  bands.forEach((edges, band) => {
    if (edges.length === 0) return;
    const v = (band + 0.5) / FACE_BANDS;
    c.beginPath();
    for (const [a, b] of edges) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
    c.strokeStyle = paint;
    c.stroke();
    c.strokeStyle = `rgba(0, 0, 0, ${(0.45 * (1 - v)).toFixed(3)})`;
    c.stroke();
  });
  c.restore();
}

// Where a direct flashlight beam's centre line hits a wall: the point, how far it is, the wall
// face's direction there, and how squarely the beam hits it (1 = head-on, near 0 = grazing).
const beamWallHit = (group: LightGroup) => {
  if (group.beamAxis === undefined || group.depth !== 0) return null;
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
      return walls.some(w => inside.x > w.x && inside.x < w.x + w.w && inside.y > w.y && inside.y < w.y + w.h) ? hit : null;
    }
  }
  return null;
}

// Where the beam's centre hits a wall, the wall itself shows through in a soft spot: the wall's own
// art faded in, so it's never brighter than the wall really is. The spot is the beam's footprint (at
// least HOTSPOT_MIN_RADIUS, since close up the beam is only a few px across), stretched along the wall
// at a slant as a real beam's spot is (up to HOTSPOT_MAX_STRETCH), and fades with distance. Clipped
// to the level's walls, so it never lights the floor you walk on.
const HOTSPOT_MIN_RADIUS = 0.4 * GRID_SIZE;
const HOTSPOT_BRIGHTNESS = 0.6; // how much of the wall shows at the spot's centre, close up
const HOTSPOT_MAX_STRETCH = 2;
const hotspotRadius = (dist: number) => Math.max(HOTSPOT_MIN_RADIUS, dist * Math.tan(FLASHLIGHT_CONE / 2));
const hotspotStretch = (cos: number) => Math.min(HOTSPOT_MAX_STRETCH, 1 / Math.max(cos, 1e-3));
const hotspotLayer = document.createElement('canvas');
const hotspotCtx = hotspotLayer.getContext('2d')!;
const drawBeamHotspot = (c: CanvasRenderingContext2D, group: LightGroup) => {
  const hit = beamWallHit(group);
  if (!hit) return;
  const alpha = HOTSPOT_BRIGHTNESS * Math.max(0, 1 - hit.dist / FLASHLIGHT_RANGE);
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

  c.save();
  c.beginPath();
  for (const w of levelWalls) c.rect(w.x, w.y, w.w, w.h);
  c.clip();
  c.drawImage(hotspotLayer, ox, oy);
  c.restore();
}

// The remembered floor, cached until the level's layout or anything the player has seen changes.
// Doors and mirrors are drawn as last seen, so fog never shows a change you didn't see.
const dimFloorCanvas = document.createElement('canvas');
const dimFloorCtx = dimFloorCanvas.getContext('2d')!;
let dimFloorKey = '';
const ensureDimFloor = () => {
  ensureWallArt();
  const seenDoorWalls = doors.flatMap(d => doorPanels(d, d.seenOpenAmount));
  const key = JSON.stringify([
    worldCanvas.width, worldCanvas.height, start, goal, levelWalls, seenDoorWalls, lamps,
    lightState.pickups, mirrors.map(m => m.seenStep), levers.map(l => l.on),
  ]);
  if (key === dimFloorKey) return;
  dimFloorKey = key;
  dimFloorCanvas.width = worldCanvas.width;
  dimFloorCanvas.height = worldCanvas.height;
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawFloorMarks(dimFloorCtx, true);
  dimFloorCtx.drawImage(dimWallArt, 0, 0);
  dimFloorCtx.fillStyle = DOOR_DIM_COLOR;
  for (const w of seenDoorWalls) dimFloorCtx.fillRect(w.x, w.y, w.w, w.h);
}

// Memory strength vs. fraction of the light's radius: (1 - t^k)^2, sampled as gradient stops.
const FOG_MEMORY_STOPS: [number, string][] = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const v = Math.round(255 * (1 - t ** FOG_FALLOFF_SHOULDER) ** 2);
  return [t, `rgb(${v},${v},${v})`];
});

// Writes the light in the player's line of sight into fog memory, with the same falloff as the light
// itself, so a spot is remembered only as well as it was seen. Brightness lives in the RGB of an
// opaque canvas because 'lighten' is then an exact per-pixel max (alpha would accumulate instead).
const rememberLight = (groups: LightGroup[], view: Point[][]) => {
  exploredCtx.save();
  exploredCtx.setTransform(FOG_MEMORY_SCALE, 0, 0, FOG_MEMORY_SCALE, 0, 0);
  polygonsPath(exploredCtx, view);
  exploredCtx.clip();
  exploredCtx.globalCompositeOperation = 'lighten';
  for (const g of groups) {
    const gradient = exploredCtx.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, g.radius);
    for (const [t, color] of FOG_MEMORY_STOPS) gradient.addColorStop(t, color);
    exploredCtx.fillStyle = gradient;
    polygonsPath(exploredCtx, g.polys);
    exploredCtx.fill();
    strokeWallFaces(exploredCtx, g.polys, gradient, walls);
  }
  exploredCtx.restore();
}

// Twice the signed area: its sign is the polygon's winding direction.
const signedArea = (poly: Point[]) =>
  poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p.x * q.y - q.x * p.y; }, 0);

// Everything the player can see: in direct line of sight, and in any mirror they can see (the view
// is traced like light, bouncing off mirrors). It stops at wall faces, so points are pushed
// WALL_LIGHT_PENETRATION further along their sight line to keep the lit face band. Every polygon is
// wound the same way: a mirror flips winding, and the view is filled/clipped as one path with the
// nonzero rule, where oppositely wound overlaps would cancel into holes.
const computeView = (scene: Scene): Point[][] => {
  const origin = { x: player.x, y: player.y };
  const range = Math.hypot(worldCanvas.width, worldCanvas.height) * (MAX_MIRROR_BOUNCES + 1);
  return castLight(origin, 0, Math.PI * 2, CANDLE_RAY_COUNT, range, scene, MAX_MIRROR_BOUNCES).groups.flatMap(g =>
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
  strokeWallFaces(viewMaskCtx, view, '#fff', walls);
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

// One lit region onto regionLayer: floor, floor marks and a warm glow, masked to the group's
// polygons (plus lit wall faces), faded by its radial falloff. The glow goes in before the masks so
// they shape it too, which avoids an expensive clip to the many-strip light path.
const drawLitRegion = (group: LightGroup, b: Bounds) => {
  const c = regionCtx;
  c.clearRect(b.x, b.y, b.w, b.h);
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(b.x, b.y, b.w, b.h);
  drawFloorMarks(c, false);

  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255, 220, 150, 0.5)';
  c.fillRect(b.x, b.y, b.w, b.h);

  c.globalCompositeOperation = 'destination-in';
  polygonsPath(c, group.polys);
  c.fill();

  c.globalCompositeOperation = 'source-over';
  strokeLitFaces(c, group, c.createPattern(wallArt, 'no-repeat')!, levelWalls);
  for (const door of doors) strokeLitFaces(c, group, doorColor(door), doorPanels(door, door.openAmount));
  drawBeamHotspot(c, group);

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

// Every light this frame: the one in hand, dropped ones, and the level's lamps. The player's lights
// ignite at level start; lamps are already burning.
const castAllLights = (scene: Scene, now: number) => {
  const ignite = Math.min(1, Math.max(0, (now - gameState.startedAt) / LIGHT_IGNITE_MS));
  const grow = 1 - (1 - ignite) ** 3;
  const range = (kind: LightKind) => (kind === 'flashlight' ? FLASHLIGHT_RANGE : CANDLE_RADIUS) * grow;

  const sources: { kind: LightKind; at: Point; aim: number; radius: number }[] = [];
  if (lightState.held) {
    sources.push({ kind: lightState.held, at: heldLightSource(lightState.held, scene), aim: player.aimAngle, radius: range(lightState.held) });
  }
  for (const d of lightState.dropped) {
    // A dropped flashlight shines from its handle end, so its own cell is inside the beam.
    const c = cellCenter(d), back = d.kind === 'flashlight' ? FLASHLIGHT_BACK * GRID_SIZE : 0;
    sources.push({ kind: d.kind, at: { x: c.x - Math.cos(d.aimAngle) * back, y: c.y - Math.sin(d.aimAngle) * back }, aim: d.aimAngle, radius: range(d.kind) });
  }
  for (const l of lamps) {
    const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT_EDGE_GAP;
    sources.push({ kind: 'candle', at: { x: c.x + l.toWallX * out, y: c.y + l.toWallY * out }, aim: 0, radius: LAMP_RADIUS });
  }

  const groups: LightGroup[] = [];
  let rayCount = 0;
  for (const s of sources) {
    const radius = Math.max(1, s.radius);
    const result = s.kind === 'flashlight'
      ? castLight(s.at, s.aim - FLASHLIGHT_CONE / 2, FLASHLIGHT_CONE, FLASHLIGHT_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES)
      : castLight(s.at, 0, Math.PI * 2, CANDLE_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES);
    if (s.kind === 'flashlight') {
      // The beam's centre line: the aim for the direct beam; for a reflection, the average direction
      // of its lit area from its virtual source.
      for (const g of result.groups) {
        if (g.depth === 0) { g.beamAxis = s.aim; continue; }
        let sx = 0, sy = 0;
        for (const poly of g.polys) for (const p of poly) {
          const dx = p.x - g.origin.x, dy = p.y - g.origin.y, len = Math.hypot(dx, dy) || 1;
          sx += dx / len; sy += dy / len;
        }
        g.beamAxis = Math.atan2(sy, sx);
      }
    }
    groups.push(...result.groups);
    rayCount += result.rayCount;
  }
  return { groups, rayCount, lightCount: sources.length };
}

// The camera centres on the player, clamped to the level's edges; along an axis where the level is
// smaller than the screen, it's centred.
const drawToScreen = () => {
  const zoom = camera.zoom = clampZoom(camera.zoom);
  const follow = (pos: number, worldSize: number, screenSize: number) => {
    const half = screenSize / 2 / zoom;
    return worldSize <= half * 2 ? worldSize / 2 : Math.min(worldSize - half, Math.max(half, pos));
  };
  const camX = follow(player.x, worldCanvas.width, canvas.width);
  const camY = follow(player.y, worldCanvas.height, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Whole-pixel offsets and no smoothing zoomed in, so art pixels land exactly on screen pixels and
  // don't shimmer as the camera moves. Zoomed out below 1x the art has to shrink, so it's smoothed.
  ctx.imageSmoothingEnabled = zoom < 1;
  ctx.setTransform(zoom, 0, 0, zoom, Math.round(canvas.width / 2 - camX * zoom), Math.round(canvas.height / 2 - camY * zoom));
  ctx.drawImage(worldCanvas, 0, 0);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); // on-screen text is sized in CSS px
}

const drawWinOverlay = () => {
  const w = canvas.width / pixelRatio, h = canvas.height / pixelRatio;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('Level Complete', w / 2, h / 2);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px sans-serif';
  ctx.fillText('Press Enter to continue', w / 2, h / 2 + 32);
  ctx.textAlign = 'start';
}

export const draw = (now: number) => {
  requestAnimationFrame(draw);

  // Frame cap. The 1ms slack stops rAF timing jitter from skipping a frame we wanted.
  const elapsed = now - lastFrameTime;
  if (elapsed < FRAME_INTERVAL - 1) return;
  const dt = Math.min(elapsed, 100) / 1000; // clamped so a backgrounded tab doesn't teleport the player
  lastFrameTime = now;
  fpsFrames++;
  if (now - fpsWindowStart >= 1000) {
    fps = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
    fpsFrames = 0;
    fpsWindowStart = now;
  }

  const walkAngle = tryMove(dt, litGroupsHeld === lightState.held ? litGroups : []);
  updateAim(dt, walkAngle);
  updateMirrors(dt);

  const scene = getScene(walls, mirrors);
  const { groups, rayCount, lightCount } = castAllLights(scene, now);
  litGroups = groups;
  litGroupsHeld = lightState.held;

  // Light exists everywhere it reaches (the fear rule and plates use all of it), but the player
  // only sees, and remembers, what's in line of sight.
  const view = computeView(scene);
  updateDoors(groups, view, dt);
  for (const m of mirrors) if (mirrorSeen(m, groups, view)) m.seenStep = m.shownStep;
  rememberLight(groups, view);

  // Remembered floor: dim floor x fog memory (upscaled, which softens its edges), plus the base
  // darkness added on top (a max would erase the faint end of the fade).
  ensureDimFloor();
  worldCtx.drawImage(dimFloorCanvas, 0, 0);
  worldCtx.globalCompositeOperation = 'multiply';
  worldCtx.drawImage(exploredCanvas, 0, 0, exploredCanvas.width / FOG_MEMORY_SCALE, exploredCanvas.height / FOG_MEMORY_SCALE);
  worldCtx.globalCompositeOperation = 'lighter';
  worldCtx.fillStyle = '#141110';
  worldCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  worldCtx.globalCompositeOperation = 'source-over';

  // Lit regions are added together ('lighter'), since overlapping light adds, then cut down to the
  // line of sight and drawn over the remembered floor.
  const bounds = groups.map(boundsOf);
  const litBounds = bounds.reduce(unionBounds);
  litCtx.clearRect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
  litCtx.globalCompositeOperation = 'lighter';
  groups.forEach((g, i) => { drawLitRegion(g, bounds[i]); copyRect(litCtx, regionLayer, bounds[i]); });
  litCtx.globalCompositeOperation = 'destination-in';
  copyRect(litCtx, drawViewMask(view, litBounds), litBounds);
  litCtx.globalCompositeOperation = 'source-over';
  copyRect(worldCtx, litLayer, litBounds);

  // Dropped lights in line of sight, then the player.
  for (const d of lightState.dropped) {
    const at = cellCenter(d);
    if (!insideAny(at, view)) continue;
    if (d.kind === 'flashlight') { drawFlashlight(worldCtx, at.x, at.y, d.aimAngle, true, false); continue; }
    worldCtx.fillStyle = '#fff1b0';
    worldCtx.beginPath();
    worldCtx.arc(at.x, at.y, 0.1 * GRID_SIZE, 0, Math.PI * 2);
    worldCtx.fill();
  }
  const spriteKind = lightState.held ?? 'empty';
  const { anchor } = PLAYER_SPRITES[spriteKind];
  worldCtx.save();
  worldCtx.translate(player.x, player.y);
  worldCtx.rotate(player.aimAngle);
  worldCtx.scale(PLAYER_SPRITE_SCALE, PLAYER_SPRITE_SCALE);
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.drawImage(playerSprites[spriteKind], -anchor.x, -anchor.y);
  worldCtx.restore();

  drawToScreen();

  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${lightCount} lights · ${groups.length} light groups`, 8, 16);
  if (gameState.status === 'won') drawWinOverlay();
}
