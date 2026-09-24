import { polygonsPath } from "./util";
import { tryMove, updateAim } from "./playerLogic";
import { getScene } from "./wallsLogic";
import { castLight, insideAny } from "./rayTracer";
import type { LightGroup } from "./rayTracer";
import type { Wall } from "./interfaces";
import { updateDoors } from "./doorLogic";
import {
  player, walls, CANDLE_RADIUS, LAMP_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE_DEGREES, MAX_MIRROR_BOUNCES, lightState, mirrors, GRID_SIZE,
  TARGET_FPS, CANDLE_RAY_COUNT, FLASHLIGHT_RAY_COUNT, FOG_MEMORY_SCALE, FOG_FALLOFF_SHOULDER, start, goal, gameState, LIGHT_IGNITE_MS, WALL_LIGHT_PENETRATION,
  levelWalls, doors, doorPanels, lamps, LIGHT_FALLOFF_STOPS, camera, FOG_FLOOR_BRIGHTNESS,
} from "./consts";
import type { LightKind, Point } from "./interfaces";
import { canvas, ctx, clampZoom, worldCanvas, worldCtx, exploredCanvas, exploredCtx, litLayer, litCtx, dimLayer, dimCtx } from "./main";

const FLASHLIGHT_CONE = FLASHLIGHT_CONE_DEGREES * Math.PI / 180;
// Lights that shine from a cell's edge (wall lamps, dropped flashlights) sit this far inside it.
const LIGHT_EDGE_GAP = 2;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let lastFrameTime = -Infinity;
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;
// Last frame's light, for the fear rule check on the next move, and what was held when it was cast.
// If the held light has changed since (e.g. just dropped), that light is stale, so no light is used.
let litGroups: LightGroup[] = [];
let litGroupsHeld: LightKind | null = null;

// Built once: a 2x2-cell tile of the checkerboard, repeated as a fillStyle, so the floor is a
// single fillRect regardless of canvas or cell size.
const floorTile = document.createElement('canvas');
floorTile.width = GRID_SIZE * 2;
floorTile.height = GRID_SIZE * 2;
const floorTileCtx = floorTile.getContext('2d')!;
floorTileCtx.fillStyle = 'red';
floorTileCtx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
floorTileCtx.fillRect(GRID_SIZE, GRID_SIZE, GRID_SIZE, GRID_SIZE);
floorTileCtx.fillStyle = 'blue';
floorTileCtx.fillRect(GRID_SIZE, 0, GRID_SIZE, GRID_SIZE);
floorTileCtx.fillRect(0, GRID_SIZE, GRID_SIZE, GRID_SIZE);

// Same tile, pre-desaturated/darkened for the "remembered" fog layer. The filter runs once here,
// against a 2-cell tile, rather than over the full canvas every frame.
const dimFloorTile = document.createElement('canvas');
dimFloorTile.width = GRID_SIZE * 2;
dimFloorTile.height = GRID_SIZE * 2;
const dimFloorTileCtx = dimFloorTile.getContext('2d')!;
dimFloorTileCtx.filter = `grayscale(1) brightness(${FOG_FLOOR_BRIGHTNESS})`;
dimFloorTileCtx.drawImage(floorTile, 0, 0);

// Pattern creation is deferred into these (rather than built once at module scope) because
// main.ts and renderer.ts import each other — at module-load time `ctx` isn't initialized yet.
const drawFloor = (targetCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  targetCtx.fillStyle = targetCtx.createPattern(floorTile, 'repeat')!;
  targetCtx.fillRect(x, y, w, h);
}

// A flashlight lying on the floor, pointing along `angle`: a handle, a wider head, and a lens that
// glows when it's on. `dim` is the grayscale fog-memory palette.
const drawFlashlight = (targetCtx: CanvasRenderingContext2D, x: number, y: number, angle: number, on: boolean, dim: boolean) => {
  const G = GRID_SIZE;
  targetCtx.save();
  targetCtx.translate(x, y);
  targetCtx.rotate(angle);
  targetCtx.fillStyle = dim ? '#2e2e2e' : '#3b3f46';
  targetCtx.fillRect(-0.28 * G, -0.07 * G, 0.4 * G, 0.14 * G); // handle
  targetCtx.fillStyle = dim ? '#3a3a3a' : '#555b64';
  targetCtx.fillRect(0.12 * G, -0.12 * G, 0.14 * G, 0.24 * G);  // head
  targetCtx.fillStyle = dim ? '#7a7a7a' : on ? '#fff6c8' : '#9aa3ab';
  targetCtx.fillRect(0.26 * G, -0.1 * G, 0.04 * G, 0.2 * G);    // lens
  targetCtx.restore();
}

// Start, goal and plate markers are painted onto the floor itself, in both the lit and the
// remembered floor, so they're hidden in darkness and show up exactly where the floor does.
// `dim` picks the grayscale palette that matches the remembered floor.
const drawFloorMarks = (targetCtx: CanvasRenderingContext2D, dim: boolean) => {
  targetCtx.lineWidth = 3;
  const center = (c: { gridX: number; gridY: number }) => [(c.gridX + 0.5) * GRID_SIZE, (c.gridY + 0.5) * GRID_SIZE];

  const [sx, sy] = center(start);
  targetCtx.strokeStyle = dim ? '#6e6e6e' : '#e8e0d0';
  targetCtx.beginPath();
  targetCtx.arc(sx, sy, GRID_SIZE * 0.35, 0, Math.PI * 2);
  targetCtx.stroke();

  const [gx, gy] = center(goal);
  const r = GRID_SIZE * 0.3;
  targetCtx.strokeStyle = dim ? '#777' : '#f5c542';
  targetCtx.beginPath();
  targetCtx.moveTo(gx, gy - r);
  targetCtx.lineTo(gx + r, gy);
  targetCtx.lineTo(gx, gy + r);
  targetCtx.lineTo(gx - r, gy);
  targetCtx.closePath();
  targetCtx.stroke();

  // Wall lamps: a mounting bar along the wall edge with a half-disc glass bulging into the room.
  for (const l of lamps) {
    const [cx, cy] = center(l);
    const ex = cx + l.toWallX * GRID_SIZE / 2, ey = cy + l.toWallY * GRID_SIZE / 2;
    const alongX = Math.abs(l.toWallY), alongY = Math.abs(l.toWallX); // unit vector along the wall
    const barHalf = GRID_SIZE * 0.25, barDepth = 4;
    targetCtx.fillStyle = dim ? '#6a6a6a' : '#b08a4a';
    targetCtx.fillRect(
      Math.min(ex - alongX * barHalf, ex - l.toWallX * barDepth),
      Math.min(ey - alongY * barHalf, ey - l.toWallY * barDepth),
      alongX * barHalf * 2 + alongY * barDepth,
      alongY * barHalf * 2 + alongX * barDepth,
    );
    const facing = Math.atan2(-l.toWallY, -l.toWallX);
    targetCtx.fillStyle = dim ? '#8a8a8a' : '#ffd27a';
    targetCtx.beginPath();
    targetCtx.arc(ex, ey, GRID_SIZE * 0.16, facing - Math.PI / 2, facing + Math.PI / 2);
    targetCtx.closePath();
    targetCtx.fill();
  }

  // Unfound lights, switched off.
  for (const p of lightState.pickups) {
    const [px, py] = center(p);
    drawFlashlight(targetCtx, px, py, p.aimAngle, false, dim);
  }

  // Plates: a dark recessed tile while idle, a cool cyan glow while lit, so the state change reads
  // clearly against the warm candlelight.
  const half = GRID_SIZE * 0.3;
  for (const door of doors) {
    const [px, py] = center(door.plate);
    const active = !dim && door.plateLit;
    targetCtx.fillStyle = dim ? '#3a3a3a' : active ? '#8fe3ff' : '#2a2622';
    targetCtx.fillRect(px - half, py - half, half * 2, half * 2);
    targetCtx.strokeStyle = dim ? '#6a6a6a' : active ? '#e0f8ff' : '#8a8378';
    targetCtx.strokeRect(px - half, py - half, half * 2, half * 2);
  }
}

const WALL_LIT_COLOR = '#8c8272';
// The lit colours put through the same grayscale + FOG_FLOOR_BRIGHTNESS (0.45) as the dim floor.
// Recompute if that changes.
const WALL_DIM_COLOR = '#3b3b3b';
const DOOR_DIM_COLOR = '#282828';

// Light doors are plain wood. Locked doors show their state: red while locked, green while
// unlocked (plate lit) or opened.
const doorColor = (door: typeof doors[0]) => {
  if (door.kind === 'light') return '#7a5230';
  return door.plateLit || door.opened ? '#4f8a3a' : '#8a2e24';
}

const rectsPath = (targetCtx: CanvasRenderingContext2D, rects: Wall[]) => {
  targetCtx.beginPath();
  for (const w of rects) targetCtx.rect(w.x, w.y, w.w, w.h);
}

// Light polygons end exactly on the wall faces they hit. Stroking their outline, clipped to the
// walls, paints a band WALL_LIGHT_PENETRATION px deep into just those faces, so walls show up
// only where light actually reaches them. Clipping to a handful of rects is cheap, unlike
// clipping to the many-strip light path.
const strokeWallFaces = (targetCtx: CanvasRenderingContext2D, polygons: { x: number; y: number }[][], style: string | CanvasGradient, rects: Wall[]) => {
  if (rects.length === 0) return;
  targetCtx.save();
  rectsPath(targetCtx, rects);
  targetCtx.clip();
  targetCtx.strokeStyle = style;
  targetCtx.lineWidth = WALL_LIGHT_PENETRATION * 2;
  polygonsPath(targetCtx, polygons);
  targetCtx.stroke();
  targetCtx.restore();
}

// The dim floor only changes on resize or when a level with a different layout loads, so it's
// drawn full-window once and cached until one of those changes.
const dimFloorCanvas = document.createElement('canvas');
const dimFloorCtx = dimFloorCanvas.getContext('2d')!;
let dimFloorKey = '';
const ensureDimFloor = () => {
  // Doors are drawn as last seen, not as they are, so fog never shows a change you didn't see.
  const seenDoorWalls = doors.flatMap(d => doorPanels(d, d.seenOpenAmount));
  let key = `${worldCanvas.width}x${worldCanvas.height}:${start.gridX},${start.gridY}:${goal.gridX},${goal.gridY}`;
  for (const w of [...levelWalls, ...seenDoorWalls]) key += `:${w.x},${w.y},${w.w},${w.h}`;
  for (const l of lamps) key += `:L${l.gridX},${l.gridY}`;
  for (const p of lightState.pickups) key += `:F${p.gridX},${p.gridY}`; // gone once picked up, which you're there to see
  if (key === dimFloorKey) return;
  dimFloorKey = key;
  dimFloorCanvas.width = worldCanvas.width;
  dimFloorCanvas.height = worldCanvas.height;
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawFloorMarks(dimFloorCtx, true);
  dimFloorCtx.fillStyle = WALL_DIM_COLOR;
  for (const w of levelWalls) dimFloorCtx.fillRect(w.x, w.y, w.w, w.h);
  dimFloorCtx.fillStyle = DOOR_DIM_COLOR;
  for (const w of seenDoorWalls) dimFloorCtx.fillRect(w.x, w.y, w.w, w.h);
}

// Memory strength vs. fraction of the light's radius: (1 - t^k)^2. Smooth everywhere, exactly 0 at
// the edge, and k sets where the shoulder sits (higher = holds bright longer before fading) without
// ever turning into a sharp band. Canvas gradients interpolate linearly, so it's sampled as stops.
const FOG_MEMORY_STOPS: [number, string][] = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const v = Math.round(255 * (1 - t ** FOG_FALLOFF_SHOULDER) ** 2);
  return [t, `rgb(${v},${v},${v})`];
});

// Writes this frame's light into the fog memory, using the same falloff as the light itself, so a
// spot is remembered only as well as it was seen: the rim of the light's reach becomes a faint
// memory rather than a hard-edged full one. Brightness lives in the RGB of an opaque canvas
// because 'lighten' is then an exact per-pixel max, so memory only ever grows toward the
// brightest it's been lit and never creeps up just from standing still. (Storing it in alpha
// wouldn't work: alpha always accumulates under canvas blend modes.)
// Only what's in `view` (the player's line of sight) gets remembered.
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

// What the player can see: everything in direct line of sight, however far. It stops at wall
// faces, so each far edge is pushed WALL_LIGHT_PENETRATION into the wall to keep the lit face band.
const VIEW_BOUNCES = 0;
const computeView = (scene: ReturnType<typeof getScene>): Point[][] => {
  const origin = { x: player.x, y: player.y };
  const range = Math.hypot(worldCanvas.width, worldCanvas.height);
  const direct = castLight(origin, 0, Math.PI * 2, CANDLE_RAY_COUNT, range, scene, VIEW_BOUNCES).groups[0];
  return direct.polys.map(poly => poly.map((p, i) => {
    if (i === 0) return p; // the fan's shared corner, at the player
    const dx = p.x - origin.x, dy = p.y - origin.y, len = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / len * WALL_LIGHT_PENETRATION, y: p.y + dy / len * WALL_LIGHT_PENETRATION };
  }));
}

// Instead of clearing/filling/compositing the full window for an effect that only ever lights a
// small area, clamp to the polygon's own bounding box. A square around the origin would work for
// the candle (a full circle), but not the flashlight — its cone only lights a thin 20°-wide wedge
// of its ~750px range, and a symmetric square around the origin would cover the other 340° for
// nothing, undoing most of the point of bounding it in the first place. Padded by the wall
// penetration, since the wall-face band reaches that far past the polygon.
const boundsFromPolygons = (polygons: { x: number; y: number }[][]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = WALL_LIGHT_PENETRATION;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(worldCanvas.width, Math.ceil(maxX + pad));
  const bottom = Math.min(worldCanvas.height, Math.ceil(maxY + pad));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

type Bounds = { x: number; y: number; w: number; h: number };
const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w), bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

// Draws one lit region into dimLayer: floor plus warm glow, masked to `polygons`, faded by a radial
// falloff centred on `origin`. The glow goes in before the masks so the masks shape it too — no
// clip() needed, which matters because clipping to a many-strip path is expensive on the GPU and
// this runs once per light group. Same color for direct and reflected light: a mirror doesn't
// recolor light, it just sends less of it onward.
const drawLitRegion = (polygons: { x: number; y: number }[][], origin: { x: number; y: number }, radius: number, b: Bounds) => {
  dimCtx.clearRect(b.x, b.y, b.w, b.h);
  drawFloor(dimCtx, b.x, b.y, b.w, b.h);
  drawFloorMarks(dimCtx, false);

  dimCtx.globalCompositeOperation = 'lighter';
  dimCtx.fillStyle = 'rgba(255, 220, 150, 0.5)';
  dimCtx.fillRect(b.x, b.y, b.w, b.h);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonsPath(dimCtx, polygons);
  dimCtx.fill();

  dimCtx.globalCompositeOperation = 'source-over';
  strokeWallFaces(dimCtx, polygons, WALL_LIT_COLOR, levelWalls);
  for (const door of doors) strokeWallFaces(dimCtx, polygons, doorColor(door), doorPanels(door, door.openAmount));

  dimCtx.globalCompositeOperation = 'destination-in';
  const falloff = dimCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
  for (const [t, v] of LIGHT_FALLOFF_STOPS) falloff.addColorStop(t, `rgba(255,255,255,${v})`);
  dimCtx.fillStyle = falloff;
  dimCtx.fillRect(b.x, b.y, b.w, b.h);
  dimCtx.globalCompositeOperation = 'source-over';
}

export const draw = (now: number) => {
  requestAnimationFrame(draw);

  // Frame cap: rAF still fires at the display rate, we just skip frames until the interval has
  // passed. The 1ms slack stops rAF timing jitter from occasionally skipping a frame we wanted.
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

  tryMove(dt, litGroupsHeld === lightState.held ? litGroups : []);
  updateAim(dt);

  const scene = getScene(walls, mirrors);

  // Light ignites on level start: radius eases out from nothing to full over LIGHT_IGNITE_MS.
  const ignite = Math.min(1, Math.max(0, (now - gameState.startedAt) / LIGHT_IGNITE_MS));
  const radiusScale = 1 - (1 - ignite) ** 3;

  // Every light: the one in hand (at the player), any dropped ones, and the level's lamps. The
  // player's lights ignite at level start; lamps are already burning. Lamps shine all round like a
  // candle, just further.
  const sources: { kind: LightKind; x: number; y: number; aimAngle: number; radius: number }[] = [];
  const cellCenter = (c: { gridX: number; gridY: number }) => ({ x: (c.gridX + 0.5) * GRID_SIZE, y: (c.gridY + 0.5) * GRID_SIZE });
  const heldRadius = (kind: LightKind) => (kind === 'flashlight' ? FLASHLIGHT_RANGE : CANDLE_RADIUS) * radiusScale;
  if (lightState.held) sources.push({ kind: lightState.held, x: player.x, y: player.y, aimAngle: player.aimAngle, radius: heldRadius(lightState.held) });
  for (const d of lightState.dropped) {
    // A dropped flashlight shines from the back of its handle, not the cell centre: a cone starting
    // at the centre would leave the cell itself unlit, and the fear rule would stop you stepping
    // back on. (0.28 matches the handle's back end in drawFlashlight.)
    const c = cellCenter(d), back = d.kind === 'flashlight' ? GRID_SIZE * 0.28 : 0;
    sources.push({ kind: d.kind, x: c.x - Math.cos(d.aimAngle) * back, y: c.y - Math.sin(d.aimAngle) * back, aimAngle: d.aimAngle, radius: heldRadius(d.kind) });
  }
  for (const l of lamps) {
    // Shines from the wall edge, LIGHT_EDGE_GAP px out so rays never start on the wall face itself
    // (they'd skip it and leak into the wall).
    const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT_EDGE_GAP;
    sources.push({ kind: 'candle', x: c.x + l.toWallX * out, y: c.y + l.toWallY * out, aimAngle: 0, radius: LAMP_RADIUS });
  }

  const groups: LightGroup[] = [];
  let rayCount = 0;
  for (const s of sources) {
    const origin = { x: s.x, y: s.y };
    const radius = Math.max(1, s.radius);
    const result = s.kind === 'flashlight'
      ? castLight(origin, s.aimAngle - FLASHLIGHT_CONE / 2, FLASHLIGHT_CONE, FLASHLIGHT_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES)
      : castLight(origin, 0, Math.PI * 2, CANDLE_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES);
    groups.push(...result.groups);
    rayCount += result.rayCount;
  }
  litGroups = groups;
  litGroupsHeld = lightState.held;

  // Light exists everywhere it reaches (the fear rule and plates use all of it), but the player
  // only sees, and remembers, the parts in line of sight.
  const view = computeView(scene);

  updateDoors(groups, view, dt);

  // 1. Record everything lit this frame, direct and reflected, into the fog memory
  rememberLight(groups, view);

  // 2. Remembered floor: dim floor multiplied by the memory mask (upscaled with bilinear smoothing,
  // which is what softens its edges), with the base darkness added on top. Added, not max'd: the
  // dim floor is darker than the base in places, and a max would erase the faint end of the fade.
  ensureDimFloor();
  worldCtx.drawImage(dimFloorCanvas, 0, 0);
  worldCtx.globalCompositeOperation = 'multiply';
  worldCtx.drawImage(exploredCanvas, 0, 0, exploredCanvas.width / FOG_MEMORY_SCALE, exploredCanvas.height / FOG_MEMORY_SCALE);
  worldCtx.globalCompositeOperation = 'lighter';
  worldCtx.fillStyle = '#141110';
  worldCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  worldCtx.globalCompositeOperation = 'source-over';

  // 3. Every currently-lit region (direct light, then one per mirror chain) is accumulated
  // additively ('lighter') onto litLayer, since overlapping light adds, and doing so makes the
  // result independent of draw order. Each reflection's falloff is centred on its chain's virtual
  // source, so brightness tracks true path length and deeper bounces come out dimmer.
  const bounds = groups.map(g => boundsFromPolygons(g.polys));
  const litBounds = bounds.reduce(unionBounds);
  litCtx.clearRect(litBounds.x, litBounds.y, litBounds.w, litBounds.h);
  litCtx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i], b = bounds[i];
    drawLitRegion(group.polys, group.origin, group.radius, b);
    litCtx.drawImage(dimLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
  }

  // Keep only what's in line of sight. A fill, not a clip, so its cost doesn't scale with the
  // number of light groups.
  litCtx.globalCompositeOperation = 'destination-in';
  polygonsPath(litCtx, view);
  litCtx.fill();
  litCtx.globalCompositeOperation = 'source-over';

  // 4. Composite the accumulated lit layer onto the main canvas in one pass.
  worldCtx.drawImage(litLayer, litBounds.x, litBounds.y, litBounds.w, litBounds.h, litBounds.x, litBounds.y, litBounds.w, litBounds.h);

  // 5. Dropped lights (only those in line of sight), then the player
  for (const d of lightState.dropped) {
    const x = (d.gridX + 0.5) * GRID_SIZE, y = (d.gridY + 0.5) * GRID_SIZE;
    if (!insideAny({ x, y }, view)) continue;
    if (d.kind === 'flashlight') {
      drawFlashlight(worldCtx, x, y, d.aimAngle, true, false);
    } else {
      worldCtx.fillStyle = '#fff1b0';
      worldCtx.beginPath();
      worldCtx.arc(x, y, 5, 0, Math.PI * 2);
      worldCtx.fill();
    }
  }
  worldCtx.fillStyle = 'orange';
  worldCtx.beginPath();
  worldCtx.arc(player.x, player.y, 12, 0, Math.PI * 2); // drawn bigger than the collision footprint
  worldCtx.fill();

  // 6. Mirrors
  worldCtx.strokeStyle = '#8cf';
  worldCtx.lineWidth = 4;
  for (const m of mirrors) {
    worldCtx.beginPath();
    worldCtx.moveTo(m.x1, m.y1);
    worldCtx.lineTo(m.x2, m.y2);
    worldCtx.stroke();
  }

  // 7. Camera: show the world on screen, centred on the player and zoomed. Along each axis where
  // the level is bigger than the screen, the view is clamped to the level's edge; where it's
  // smaller, the level is centred.
  const zoom = camera.zoom = clampZoom(camera.zoom); // limits change with window size and level
  const follow = (playerPos: number, worldSize: number, screenSize: number) => {
    const half = screenSize / 2 / zoom;
    return worldSize <= half * 2 ? worldSize / 2 : Math.min(worldSize - half, Math.max(half, playerPos));
  };
  const camX = follow(player.x, worldCanvas.width, canvas.width);
  const camY = follow(player.y, worldCanvas.height, canvas.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom, 0, 0, zoom, canvas.width / 2 - camX * zoom, canvas.height / 2 - camY * zoom);
  ctx.drawImage(worldCanvas, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 8. Perf readout
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${sources.length} lights · ${groups.length} light groups`, 8, 16);

  // 9. Win overlay
  if (gameState.status === 'won') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f5c542';
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('Level Complete', canvas.width / 2, canvas.height / 2);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText('Press Enter to continue', canvas.width / 2, canvas.height / 2 + 32);
    ctx.textAlign = 'start';
  }
}
