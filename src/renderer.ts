import { polygonsPath } from "./util";
import { tryMove, updateVisual } from "./playerLogic";
import { getScene } from "./wallsLogic";
import { castLight } from "./rayTracer";
import type { LightGroup } from "./rayTracer";
import {
  player, walls, CANDLE_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE_DEGREES, MAX_MIRROR_BOUNCES, lightState, mirrors, GRID_SIZE,
  TARGET_FPS, CANDLE_RAY_COUNT, FLASHLIGHT_RAY_COUNT, FOG_MEMORY_SCALE, FOG_FALLOFF_SHOULDER, start, goal, gameState, LIGHT_IGNITE_MS, WALL_LIGHT_PENETRATION,
} from "./consts";
import { canvas, ctx, exploredCanvas, exploredCtx, litLayer, litCtx, dimLayer, dimCtx } from "./main";

const FLASHLIGHT_CONE = FLASHLIGHT_CONE_DEGREES * Math.PI / 180;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let lastFrameTime = -Infinity;
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;

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
dimFloorTileCtx.filter = 'grayscale(1) brightness(0.6)';
dimFloorTileCtx.drawImage(floorTile, 0, 0);

// Pattern creation is deferred into these (rather than built once at module scope) because
// main.ts and renderer.ts import each other — at module-load time `ctx` isn't initialized yet.
const drawFloor = (targetCtx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  targetCtx.fillStyle = targetCtx.createPattern(floorTile, 'repeat')!;
  targetCtx.fillRect(x, y, w, h);
}

// Start and goal markers are painted onto the floor itself, in both the lit and the remembered
// floor, so they're hidden in darkness and show up exactly where the floor does.
const drawFloorMarks = (targetCtx: CanvasRenderingContext2D, startColor: string, goalColor: string) => {
  targetCtx.lineWidth = 3;

  const sx = start.gridX * GRID_SIZE + GRID_SIZE / 2;
  const sy = start.gridY * GRID_SIZE + GRID_SIZE / 2;
  targetCtx.strokeStyle = startColor;
  targetCtx.beginPath();
  targetCtx.arc(sx, sy, GRID_SIZE * 0.35, 0, Math.PI * 2);
  targetCtx.stroke();

  const gx = goal.gridX * GRID_SIZE + GRID_SIZE / 2;
  const gy = goal.gridY * GRID_SIZE + GRID_SIZE / 2;
  const r = GRID_SIZE * 0.3;
  targetCtx.strokeStyle = goalColor;
  targetCtx.beginPath();
  targetCtx.moveTo(gx, gy - r);
  targetCtx.lineTo(gx + r, gy);
  targetCtx.lineTo(gx, gy + r);
  targetCtx.lineTo(gx - r, gy);
  targetCtx.closePath();
  targetCtx.stroke();
}

const WALL_LIT_COLOR = '#8c8272';
const WALL_DIM_COLOR = '#4f4f4f'; // WALL_LIT_COLOR through the same grayscale + 0.6 brightness as the dim floor

const wallsPath = (targetCtx: CanvasRenderingContext2D) => {
  targetCtx.beginPath();
  for (const w of walls) targetCtx.rect(w.x, w.y, w.w, w.h);
}

// Light polygons end exactly on the wall faces they hit. Stroking their outline, clipped to the
// walls, paints a band WALL_LIGHT_PENETRATION px deep into just those faces, so walls show up
// only where light actually reaches them. Clipping to a handful of rects is cheap, unlike
// clipping to the many-strip light path.
const strokeWallFaces = (targetCtx: CanvasRenderingContext2D, polygons: { x: number; y: number }[][], style: string | CanvasGradient) => {
  targetCtx.save();
  wallsPath(targetCtx);
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
  let key = `${canvas.width}x${canvas.height}:${start.gridX},${start.gridY}:${goal.gridX},${goal.gridY}`;
  for (const w of walls) key += `:${w.x},${w.y},${w.w},${w.h}`;
  if (key === dimFloorKey) return;
  dimFloorKey = key;
  dimFloorCanvas.width = canvas.width;
  dimFloorCanvas.height = canvas.height;
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, canvas.width, canvas.height);
  drawFloorMarks(dimFloorCtx, '#6e6e6e', '#777'); // grayscale, to match the remembered floor
  dimFloorCtx.fillStyle = WALL_DIM_COLOR;
  for (const w of walls) dimFloorCtx.fillRect(w.x, w.y, w.w, w.h);
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
const rememberLight = (groups: LightGroup[], radius: number) => {
  exploredCtx.setTransform(FOG_MEMORY_SCALE, 0, 0, FOG_MEMORY_SCALE, 0, 0);
  exploredCtx.globalCompositeOperation = 'lighten';
  for (const g of groups) {
    const gradient = exploredCtx.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, radius);
    for (const [t, color] of FOG_MEMORY_STOPS) gradient.addColorStop(t, color);
    exploredCtx.fillStyle = gradient;
    polygonsPath(exploredCtx, g.polys);
    exploredCtx.fill();
    strokeWallFaces(exploredCtx, g.polys, gradient);
  }
  exploredCtx.globalCompositeOperation = 'source-over';
  exploredCtx.setTransform(1, 0, 0, 1, 0, 0);
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
  const right = Math.min(canvas.width, Math.ceil(maxX + pad));
  const bottom = Math.min(canvas.height, Math.ceil(maxY + pad));
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
  drawFloorMarks(dimCtx, '#e8e0d0', '#f5c542');

  dimCtx.globalCompositeOperation = 'lighter';
  dimCtx.fillStyle = 'rgba(255, 220, 150, 0.5)';
  dimCtx.fillRect(b.x, b.y, b.w, b.h);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonsPath(dimCtx, polygons);
  dimCtx.fill();

  dimCtx.globalCompositeOperation = 'source-over';
  strokeWallFaces(dimCtx, polygons, WALL_LIT_COLOR);

  dimCtx.globalCompositeOperation = 'destination-in';
  const falloff = dimCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
  falloff.addColorStop(0, 'rgba(255,255,255,1)');
  falloff.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  falloff.addColorStop(1, 'rgba(255,255,255,0)');
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

  tryMove(now);
  updateVisual(dt);

  const light = { x: player.visualX, y: player.visualY }
  const scene = getScene(walls, mirrors);

  const isFlashlight = lightState.mode === 'flashlight';
  // Light ignites on level start: radius eases out from nothing to full over LIGHT_IGNITE_MS.
  const ignite = Math.min(1, Math.max(0, (now - gameState.startedAt) / LIGHT_IGNITE_MS));
  const fullRadius = isFlashlight ? FLASHLIGHT_RANGE : CANDLE_RADIUS;
  const radius = Math.max(1, fullRadius * (1 - (1 - ignite) ** 3));
  const { groups, rayCount } = isFlashlight
    ? castLight(light, player.facingAngle - FLASHLIGHT_CONE / 2, FLASHLIGHT_CONE, FLASHLIGHT_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES)
    : castLight(light, 0, Math.PI * 2, CANDLE_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES);

  // 1. Record everything lit this frame, direct and reflected, into the fog memory
  rememberLight(groups, radius);

  // 2. Remembered floor: dim floor multiplied by the memory mask (upscaled with bilinear smoothing,
  // which is what softens its edges), with the base darkness added on top. Added, not max'd: the
  // dim floor is darker than the base in places, and a max would erase the faint end of the fade.
  ensureDimFloor();
  ctx.drawImage(dimFloorCanvas, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(exploredCanvas, 0, 0, exploredCanvas.width / FOG_MEMORY_SCALE, exploredCanvas.height / FOG_MEMORY_SCALE);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#141110';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';

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
    drawLitRegion(group.polys, group.origin, radius, b);
    litCtx.drawImage(dimLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
  }

  litCtx.globalCompositeOperation = 'source-over';

  // 4. Composite the accumulated lit layer onto the main canvas in one pass.
  ctx.drawImage(litLayer, litBounds.x, litBounds.y, litBounds.w, litBounds.h, litBounds.x, litBounds.y, litBounds.w, litBounds.h);

  // 5. Player
  ctx.fillStyle = 'orange';
  ctx.beginPath();
  ctx.arc(player.visualX, player.visualY, 8, 0, Math.PI * 2);
  ctx.fill();

  // 6. Mirrors
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 4;
  for (const m of mirrors) {
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
  }

  // 7. Perf readout
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${groups.length - 1} reflections`, 8, 16);

  // 8. Win overlay
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
