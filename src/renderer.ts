import { reflectPointAcrossLine, polygonPath } from "./util";
import { tryMove, updateVisual } from "./playerLogic";
import { getBlockingSegments } from "./wallsLogic";
import { computeVisibilityPolygon } from "./lightLogic";
import { computeMirrorPolygon } from "./mirrorLogic";
import { player, walls, LIGHT_RADIUS, mirrors, GRID_SIZE } from "./consts";
import { canvas, ctx, exploredCanvas, exploredCtx, reflectionCanvas, reflectionCtx, dimLayer, dimCtx } from "./main";

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

// Every point in a light/mirror polygon is, by construction, within LIGHT_RADIUS of its origin
// (light or virtualLight) — the raycasting never produces anything farther out. So instead of
// clearing/filling/compositing the full window for an effect that only ever reaches a ~500px
// circle, clamp to a square around the origin and do the same work there.
const boundsAround = (origin: { x: number; y: number }, radius: number) => {
  const x = Math.max(0, Math.floor(origin.x - radius));
  const y = Math.max(0, Math.floor(origin.y - radius));
  const right = Math.min(canvas.width, Math.ceil(origin.x + radius));
  const bottom = Math.min(canvas.height, Math.ceil(origin.y + radius));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

// Draws the floor into dimLayer, masked to `polygon`, faded by a radial falloff centered on `origin`.
// Shared by the player's direct light and each mirror's reflected (virtual-light) cone — the mask
// itself carries the shape, so nothing drawing from dimLayer afterward needs its own ctx.clip().
// Returns the bounds used, so the caller can composite back using the same rect.
const drawFalloffMaskedFloor = (polygon: { x: number; y: number }[], origin: { x: number; y: number }) => {
  const b = boundsAround(origin, LIGHT_RADIUS);
  dimCtx.clearRect(b.x, b.y, b.w, b.h);
  drawFloor(dimCtx, b.x, b.y, b.w, b.h);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonPath(dimCtx, polygon);
  dimCtx.fill();
  dimCtx.globalCompositeOperation = 'source-over';

  dimCtx.globalCompositeOperation = 'destination-in';
  const falloff = dimCtx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, LIGHT_RADIUS);
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

export const draw = (now: number = 0) => {
  tryMove(now);
  updateVisual();

  const light = { x: player.visualX, y: player.visualY }
  const segments = getBlockingSegments(walls, mirrors);
  const points = computeVisibilityPolygon(light, segments, LIGHT_RADIUS);

  // 1. Permanently record this frame's visible area into the "explored" canvas
  exploredCtx.fillStyle = 'white';
  polygonPath(exploredCtx, points);
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
  const lightBounds = drawFalloffMaskedFloor(points, light);
  ctx.drawImage(dimLayer, lightBounds.x, lightBounds.y, lightBounds.w, lightBounds.h, lightBounds.x, lightBounds.y, lightBounds.w, lightBounds.h);

  // 5. Per-mirror reflected light: same falloff-masked floor, cast from each mirror's virtual light.
  // Unclipped by the direct-light polygon on purpose — this is what lets reflections land in areas
  // the player can't directly see, which is the whole point of the mirror mechanic.
  for (const m of mirrors) {
    const poly = computeMirrorPolygon(light, m, segments, LIGHT_RADIUS);
    if (!poly || poly.length < 3) continue;

    const virtualLight = reflectPointAcrossLine(light, { x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });

    const b = drawFalloffMaskedFloor(poly, virtualLight);
    drawReflectionTint(b);

    ctx.drawImage(dimLayer, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);         // faded floor for this mirror's reflection
    ctx.drawImage(reflectionCanvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h); // tinted overlay for this mirror's reflection

    // Keep exploredCtx as a flat mask — "ever seen" memory doesn't need falloff
    exploredCtx.fillStyle = 'white';
    polygonPath(exploredCtx, poly);
    exploredCtx.fill();
  }

  // 6. Warm color glow on top of the direct light, same falloff shape, purely for tint.
  // This one still needs its own clip: unlike the passes above, it isn't drawn from an
  // already-masked dimLayer, so without it the glow would bleed through walls.
  ctx.save();
  polygonPath(ctx, points);
  ctx.clip();
  const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, LIGHT_RADIUS);
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
  requestAnimationFrame(draw);
}
