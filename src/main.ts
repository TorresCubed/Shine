import { FOG_MEMORY_SCALE, GRID_SIZE, CAMERA_MAX_ZOOM } from "./consts";
import { keysDown, gameState, loadLevel, camera } from "./state";
import { levels } from "./levels";
import { draw } from "./renderer";
import { act, swapHeldLight } from "./playerLogic";

// The screen: only ever shows the camera's view of worldCanvas, plus on-screen text.
export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

// The whole level, drawn at 1px per world pixel. Everything below is sized to the level too, so
// levels can be bigger than the window.
export const worldCanvas = document.createElement('canvas');
export const worldCtx = worldCanvas.getContext('2d')!;

// Fog memory: a low-res grayscale mask, each pixel the brightest that spot has ever been seen lit.
export const exploredCanvas = document.createElement('canvas');
export const exploredCtx = exploredCanvas.getContext('2d')!;

// All of this frame's light regions, added together, before going onto the world canvas.
export const litLayer = document.createElement('canvas');
export const litCtx = litLayer.getContext('2d')!;

// Scratch canvas each single light region is built on.
export const regionLayer = document.createElement('canvas');
export const regionCtx = regionLayer.getContext('2d')!;

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// Sizes every world layer to the level, which also wipes the fog memory.
const setWorldSize = (width: number, height: number) => {
  for (const c of [worldCanvas, regionLayer, litLayer]) { c.width = width; c.height = height; }
  exploredCanvas.width = Math.ceil(width * FOG_MEMORY_SCALE);
  exploredCanvas.height = Math.ceil(height * FOG_MEMORY_SCALE);
  exploredCtx.fillStyle = 'black';
  exploredCtx.fillRect(0, 0, exploredCanvas.width, exploredCanvas.height);
}

let levelIndex = 0;
const startLevel = (index: number) => {
  levelIndex = index;
  loadLevel(levels[index]);
  setWorldSize(levels[index].width * GRID_SIZE, levels[index].height * GRID_SIZE);
}

// Zoom limits: in to CAMERA_MAX_ZOOM, out to where the whole level fits on screen.
export const clampZoom = (zoom: number) => {
  const fit = Math.min(canvas.width / worldCanvas.width, canvas.height / worldCanvas.height);
  return Math.min(CAMERA_MAX_ZOOM, Math.max(Math.min(fit, CAMERA_MAX_ZOOM), zoom));
}

const zoomBy = (factor: number) => {
  camera.zoom = clampZoom(camera.zoom * factor);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keysDown.add(key);
  if (key === 'f') swapHeldLight();
  if (key === ' ') {
    e.preventDefault(); // Space would otherwise scroll the page
    act();
  }
  if (key === '=' || key === '+') zoomBy(1.25);
  if (key === '-') zoomBy(1 / 1.25);
  if (key === 'enter' && gameState.status === 'won') startLevel((levelIndex + 1) % levels.length);
  if (key === 'r') startLevel(levelIndex);
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

resize();
startLevel(levels.length - 1); // newest level first while designing levels; switch to 0 for a full playthrough

requestAnimationFrame(draw);
