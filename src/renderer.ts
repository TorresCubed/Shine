import { polygonsPath } from "./util";
import { tryMove, updateVisual } from "./playerLogic";
import { getScene } from "./wallsLogic";
import { castLight } from "./rayTracer";
import type { LightGroup } from "./rayTracer";
import {
  player, walls, CANDLE_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE_DEGREES, MAX_MIRROR_BOUNCES, lightState, mirrors, GRID_SIZE,
  TARGET_FPS, CANDLE_RAY_COUNT, FLASHLIGHT_RAY_COUNT, FOG_MEMORY_SCALE, FOG_FALLOFF_SHOULDER,
} from "./consts";
import { canvas, ctx, exploredCanvas, exploredCtx, litLayer, litCtx, dimLayer, dimCtx } from "./main";

const FLASHLIGHT_CONE = FLASHLIGHT_CONE_DEGREES * Math.PI / 180;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let lastFrameTime = -Infinity;
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;

// Built once: a 2x2-cell tile of the checkerboard, repeated as a fillStyle. Drawing the floor
// used to mean one fillRect per grid cell (thousands per frame across a full window, redone up
// to 3x/frame) — this collapses it to a single fillRect regardless of canvas or cell size.
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

// Same tile, pre-desaturated/darkened for the "remembered" fog layer — bakes in the same
// grayscale(1) brightness(0.6) that used to run as a live CSS filter over the full canvas
// every frame. The filter only ever runs once here, against a 2-cell tile.
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

// The dim floor never changes, so it's drawn full-window once and only rebuilt on resize.
const dimFloorCanvas = document.createElement('canvas');
const dimFloorCtx = dimFloorCanvas.getContext('2d')!;
const ensureDimFloor = () => {
  if (dimFloorCanvas.width === canvas.width && dimFloorCanvas.height === canvas.height) return;
  dimFloorCanvas.width = canvas.width;
  dimFloorCanvas.height = canvas.height;
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, canvas.width, canvas.height);
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
  }
  exploredCtx.globalCompositeOperation = 'source-over';
  exploredCtx.setTransform(1, 0, 0, 1, 0, 0);
}

// Instead of clearing/filling/compositing the full window for an effect that only ever lights a
// small area, clamp to the polygon's own bounding box. A square around the origin would work for
// the candle (a full circle), but not the flashlight — its cone only lights a thin 20°-wide wedge
// of its ~750px range, and a symmetric square around the origin would cover the other 340° for
// nothing, undoing most of the point of bounding it in the first place.
const boundsFromPolygons = (polygons: { x: number; y: number }[][]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const right = Math.min(canvas.width, Math.ceil(maxX));
  const bottom = Math.min(canvas.height, Math.ceil(maxY));
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

  dimCtx.globalCompositeOperation = 'lighter';
  dimCtx.fillStyle = 'rgba(255, 220, 150, 0.5)';
  dimCtx.fillRect(b.x, b.y, b.w, b.h);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonsPath(dimCtx, polygons);
  dimCtx.fill();

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
  const radius = isFlashlight ? FLASHLIGHT_RANGE : CANDLE_RADIUS;
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

  // 4. Every currently-lit region (direct light, then one per mirror chain) is accumulated
  // additively ('lighter') onto litLayer, since overlapping light adds. Stacking translucent
  // layers straight onto ctx with source-over compounded overlaps unrealistically and depended on
  // draw order. Each reflection's falloff is centred on its chain's virtual source, so brightness
  // tracks true path length and deeper bounces come out dimmer.
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

  // 5. Composite the accumulated lit layer onto the main canvas in one pass.
  ctx.drawImage(litLayer, litBounds.x, litBounds.y, litBounds.w, litBounds.h, litBounds.x, litBounds.y, litBounds.w, litBounds.h);

  ctx.fillStyle = 'orange';
  ctx.beginPath();
  ctx.arc(player.visualX, player.visualY, 8, 0, Math.PI * 2);
  ctx.fill();

  // 6. Walls, drawn on top, always visible if within explored or lit area
  ctx.fillStyle = '#0F1411';
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);

  // 7. Mirrors
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 4;
  for (const m of mirrors) {
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
  }

  // 8. Perf readout
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${groups.length - 1} reflections`, 8, 16);
}
