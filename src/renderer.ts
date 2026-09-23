import { polygonsPath } from "./util";
import { tryMove, updateVisual } from "./playerLogic";
import { getScene } from "./wallsLogic";
import { castLight } from "./rayTracer";
import {
  player, walls, CANDLE_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_CONE_DEGREES, MAX_MIRROR_BOUNCES, lightState, mirrors, GRID_SIZE,
  TARGET_FPS, CANDLE_RAY_COUNT, FLASHLIGHT_RAY_COUNT,
} from "./consts";
import { canvas, ctx, exploredCanvas, exploredCtx, reflectionCanvas, reflectionCtx, dimLayer, dimCtx } from "./main";

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

const drawDimFloor = (targetCtx: CanvasRenderingContext2D) => {
  targetCtx.fillStyle = targetCtx.createPattern(dimFloorTile, 'repeat')!;
  targetCtx.fillRect(0, 0, canvas.width, canvas.height);
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

// Draws the floor into dimLayer, masked to `polygons`, faded by a radial falloff centered on `origin`.
// Shared by the player's direct light and each mirror chain's reflected light — the mask
// itself carries the shape, so nothing drawing from dimLayer afterward needs its own ctx.clip().
// Returns the bounds used, so the caller can composite back using the same rect.
const drawFalloffMaskedFloor = (polygons: { x: number; y: number }[][], origin: { x: number; y: number }, radius: number) => {
  const b = boundsFromPolygons(polygons);
  dimCtx.clearRect(b.x, b.y, b.w, b.h);
  drawFloor(dimCtx, b.x, b.y, b.w, b.h);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonsPath(dimCtx, polygons);
  dimCtx.fill();
  dimCtx.globalCompositeOperation = 'source-over';

  dimCtx.globalCompositeOperation = 'destination-in';
  const falloff = dimCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
  falloff.addColorStop(0, 'rgba(255,255,255,1)');
  falloff.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  falloff.addColorStop(1, 'rgba(255,255,255,0)');
  dimCtx.fillStyle = falloff;
  dimCtx.fillRect(b.x, b.y, b.w, b.h);
  dimCtx.globalCompositeOperation = 'source-over';

  return b;
}

// Tints whatever's currently in dimLayer (within `b`) and writes the result into reflectionCanvas.
const drawReflectionTint = (b: { x: number; y: number; w: number; h: number }) => {
  reflectionCtx.clearRect(b.x, b.y, b.w, b.h);
  reflectionCtx.fillStyle = 'rgba(140, 200, 255, 0.15)';
  reflectionCtx.fillRect(b.x, b.y, b.w, b.h);
  reflectionCtx.globalCompositeOperation = 'destination-in';
  reflectionCtx.drawImage(dimLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
  reflectionCtx.globalCompositeOperation = 'source-over';
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
  const direct = groups[0].polys;

  // 1. Permanently record this frame's visible area into the "explored" canvas
  exploredCtx.fillStyle = 'white';
  polygonsPath(exploredCtx, direct);
  exploredCtx.fill();

  // 2. Base darkness
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Dim "remembered" layer: floor, desaturated, masked to everything ever explored
  dimCtx.clearRect(0, 0, canvas.width, canvas.height);
  drawDimFloor(dimCtx);

  dimCtx.globalCompositeOperation = 'destination-in';
  dimCtx.drawImage(exploredCanvas, 0, 0);
  dimCtx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = 1; // no longer need the opacity trick, grayscale+brightness does the dimming now
  ctx.drawImage(dimLayer, 0, 0);

  // 4. Bright "currently lit" layer: floor, with radial falloff, masked to the live visibility polygon
  const lightBounds = drawFalloffMaskedFloor(direct, light, radius);
  ctx.drawImage(dimLayer, lightBounds.x, lightBounds.y, lightBounds.w, lightBounds.h, lightBounds.x, lightBounds.y, lightBounds.w, lightBounds.h);

  // 5. Reflected light: one group per mirror chain the rays actually travelled, each rendered the
  // same way as the direct light (falloff-masked floor + tint). The falloff is centred on the
  // chain's virtual source with the light's full range as radius, so brightness tracks true path
  // length and deeper bounces come out dimmer. The flashlight's cone carries through bounces
  // naturally, because only rays inside the cone were ever cast.
  for (let i = 1; i < groups.length; i++) {
    const group = groups[i];
    const b = drawFalloffMaskedFloor(group.polys, group.origin, radius);
    drawReflectionTint(b);

    ctx.drawImage(dimLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);         // faded floor for this reflection
    ctx.drawImage(reflectionCanvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h); // tinted overlay for this reflection

    // Keep exploredCtx as a flat mask — "ever seen" memory doesn't need falloff
    exploredCtx.fillStyle = 'white';
    polygonsPath(exploredCtx, group.polys);
    exploredCtx.fill();
  }

  // 6. Warm color glow on top of the direct light, same falloff shape, purely for tint.
  // This one still needs its own clip: unlike the passes above, it isn't drawn from an
  // already-masked dimLayer, so without it the glow would bleed through walls.
  ctx.save();
  polygonsPath(ctx, direct);
  ctx.clip();
  const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
  gradient.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(lightBounds.x, lightBounds.y, lightBounds.w, lightBounds.h);
  ctx.restore();

  ctx.fillStyle = 'orange';
  ctx.beginPath();
  ctx.arc(player.visualX, player.visualY, 8, 0, Math.PI * 2);
  ctx.fill();

  // 7. Walls, drawn on top, always visible if within explored or lit area
  ctx.fillStyle = '#111';
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);

  // 8. Mirrors
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 4;
  for (const m of mirrors) {
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
  }

  // 9. Perf readout
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${groups.length - 1} reflections`, 8, 16);
}
