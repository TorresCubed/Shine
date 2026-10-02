import { easeInOut } from "../core/util";
import type { Point } from "../core/types";
import { FOG, CAMERA } from "../core/consts";
import { player, camera } from "../core/state";
import { canvas, ctx, clampZoom, pixelRatio, worldCanvas } from "./canvases";
import type { Bounds } from "./geometry";

// The camera follows the player (plus any pan), clamped to the level's edges, or centred on a level
// smaller than the screen. It glides to a new zoom over CAMERA.zoomEaseMs, drawn smoothed on the way;
// mid-pinch it follows your fingers exactly.
let zoomFrom = 0, zoomTo = 0, zoomMs = 0;
export const screenView = { zoom: 1, x: 0, y: 0 }; // the world-to-screen transform last drawn with, in canvas px
// The world point under a point on the page (CSS px, e.g. a tap), as last drawn.
export const screenToWorld = (clientX: number, clientY: number): Point => ({
  x: (clientX * pixelRatio - screenView.x) / screenView.zoom,
  y: (clientY * pixelRatio - screenView.y) / screenView.zoom,
});
// Mid-glide, the camera heads straight from where it was to where it'll be at the new zoom (following
// the player there), in step with the zoom: its progress goes by 1/zoom, the view's size, so the view
// shrinks (or grows) toward its end evenly and never shows past the level's edges on the way.
let glideLength = CAMERA.zoomEaseMs; // this glide's length (a new level's zoom-in is slower)
let camFrom = { x: 0, y: 0 }, lastCam = { x: 0, y: 0 };
let smoothScreen = false; // this frame's camera is mid-glide or pinch, or below 1x: draw it smoothed
export const updateCamera = (dt: number) => {
  const target = camera.zoom = clampZoom(camera.zoom, camera.pinching);
  if (camera.pinching) { zoomFrom = zoomTo = target; zoomMs = glideLength = CAMERA.zoomEaseMs; }
  if (target !== zoomTo) {
    const first = !zoomTo; // (the very first frame of a level starts there)
    zoomFrom = first ? target : currentZoom();
    zoomTo = target;
    zoomMs = 0;
    glideLength = camera.glideMs ?? CAMERA.zoomEaseMs;
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
const currentZoom = () => zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomMs / glideLength));
// Jump to the next zoom instead of gliding there (a new level, behind the fade).
export const snapZoom = () => { zoomTo = 0; };

// The part of the world on screen this frame (padded a little, lined up with the fog memory's
// pixels, and clamped to the world): only it needs drawing.
export const visibleRect = (): Bounds => {
  const step = 1 / FOG.memoryScale, pad = 2;
  const x0 = Math.max(0, Math.floor((-screenView.x / screenView.zoom - pad) / step) * step);
  const y0 = Math.max(0, Math.floor((-screenView.y / screenView.zoom - pad) / step) * step);
  const x1 = Math.min(worldCanvas.width, Math.ceil(((canvas.width - screenView.x) / screenView.zoom + pad) / step) * step);
  const y1 = Math.min(worldCanvas.height, Math.ceil(((canvas.height - screenView.y) / screenView.zoom + pad) / step) * step);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// The world canvas onto the screen, through this frame's camera (updateCamera).
export const drawToScreen = () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = smoothScreen;
  ctx.setTransform(screenView.zoom, 0, 0, screenView.zoom, screenView.x, screenView.y);
  ctx.drawImage(worldCanvas, 0, 0);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); // on-screen text is sized in CSS px
}
