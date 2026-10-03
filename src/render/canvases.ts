import { FOG, CAMERA } from '../core/consts';

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
// The same, but fading while out of sight (see FOG.fadeS): how recently each spot was seen. Kept
// inverted (black = just seen, white = forgotten), so fading is exact (see memory.ts fadeMemory).
export const recentCanvas = document.createElement('canvas');
export const recentCtx = recentCanvas.getContext('2d')!;

// All of this frame's light regions, added together, before going onto the world canvas.
export const litLayer = document.createElement('canvas');
export const litCtx = litLayer.getContext('2d')!;

// Scratch canvas each single light region is built on.
export const regionLayer = document.createElement('canvas');
export const regionCtx = regionLayer.getContext('2d')!;

// The canvas has one pixel per physical screen pixel (so the browser never rescales it, e.g. with
// Windows display scaling), and is shown at the window's size.
export let pixelRatio = 1;
export const sizeScreen = () => {
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
};

// Sizes a scratch layer to the world, if it isn't already (resizing reallocates and clears it).
export const fitToWorld = (c: HTMLCanvasElement) => {
  if (c.width === worldCanvas.width && c.height === worldCanvas.height) return;
  c.width = worldCanvas.width;
  c.height = worldCanvas.height;
};

// Sizes every world layer to the level, which also wipes the fog memory.
export const setWorldSize = (width: number, height: number) => {
  for (const c of [worldCanvas, regionLayer, litLayer]) {
    c.width = width;
    c.height = height;
  }
  for (const [c, x] of [
    [exploredCanvas, exploredCtx],
    [recentCanvas, recentCtx],
  ] as const) {
    c.width = Math.ceil(width * FOG.memoryScale);
    c.height = Math.ceil(height * FOG.memoryScale);
    x.fillStyle = c === recentCanvas ? 'white' : 'black'; // nothing remembered (the recent memory is inverted)
    x.fillRect(0, 0, c.width, c.height);
  }
};

// Zoom (screen px per world px) is whole from 1 up, so art pixels stay square, except exactly fitting
// the level or mid-pinch (`free`). Below 1 it's continuous, down to fitting the whole level. The most
// is CAMERA.maxZoom art px per CSS px, so a dense phone screen zooms as far, to the eye, as a desktop.
const exactFit = () => Math.min(canvas.width / worldCanvas.width, canvas.height / worldCanvas.height);
export const clampZoom = (zoom: number, free = false) => {
  const fit = exactFit();
  const max = Math.max(CAMERA.maxZoom, Math.floor(CAMERA.maxZoom * pixelRatio));
  const z = Math.min(max, Math.max(Math.min(fit, 1), zoom));
  if (free || z < 1 || Math.abs(z - fit) < 1e-6) return z;
  return Math.floor(z);
};
// The closest zoom that shows the whole level.
export const fitZoom = () => clampZoom(exactFit());
