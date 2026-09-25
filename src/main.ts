import { FOG_MEMORY_SCALE, GRID_SIZE, CAMERA_MAX_ZOOM } from "./consts";
import { keysDown, gameState, loadLevel, camera } from "./state";
import { levels } from "./levels";
import { draw, loadAssets } from "./renderer";
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

// The canvas has one pixel per physical screen pixel (so the browser never rescales it, e.g. with
// Windows display scaling), and is shown at the window's size.
export let pixelRatio = 1;
const resize = () => {
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
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

// Zoom is screen px per world px. From 1 up it's whole numbers only, so every art pixel is an exact
// square of screen pixels. Below 1 (only to fit a level bigger than the screen) it's continuous,
// down to where the whole level fits.
export const clampZoom = (zoom: number) => {
  const fit = Math.min(canvas.width / worldCanvas.width, canvas.height / worldCanvas.height);
  const z = Math.min(CAMERA_MAX_ZOOM, Math.max(Math.min(fit, 1), zoom));
  return z >= 1 ? Math.floor(z) : z;
}

const ZOOM_OUT_STEP = 1.25; // per step below 1x
const zoomStep = (dir: 1 | -1) => {
  const z = camera.zoom;
  camera.zoom = clampZoom(dir > 0 ? (z < 1 ? Math.min(1, z * ZOOM_OUT_STEP) : z + 1) : (z > 1 ? z - 1 : z / ZOOM_OUT_STEP));
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keysDown.add(key);
  if (key === ' ') e.preventDefault(); // Space would otherwise scroll the page
  if (key === '=' || key === '+') zoomStep(1);
  if (key === '-') zoomStep(-1);
  // One-shot actions ignore the keyboard's auto-repeat, so holding a key is one press.
  if (e.repeat) return;
  if (key === 'f') swapHeldLight();
  if (key === ' ') act();
  if (key === 'enter' && gameState.status === 'won') startLevel((levelIndex + 1) % levels.length);
  if (key === 'r') startLevel(levelIndex);
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
// A wheel click is one step. Trackpads send a stream of small deltas, so those add up to a step.
let wheelTotal = 0;
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelTotal += e.deltaY;
  if (Math.abs(wheelTotal) < 50) return;
  zoomStep(wheelTotal < 0 ? 1 : -1);
  wheelTotal = 0;
}, { passive: false });

resize();
camera.zoom = Math.max(1, Math.round(pixelRatio)); // about the size the window's display scaling expects
startLevel(levels.length - 1); // newest level first while designing levels; switch to 0 for a full playthrough

loadAssets().then(() => requestAnimationFrame(draw));
