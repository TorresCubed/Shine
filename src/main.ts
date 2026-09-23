import { keysDown, lightState, FOG_MEMORY_SCALE } from "./consts";
import { draw } from "./renderer";

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

// Persistent low-res grayscale mask: each pixel is the brightest that spot has ever been lit
// (black = never seen). Opaque on purpose — see rememberLight in renderer.ts.
export const exploredCanvas = document.createElement('canvas');
export const exploredCtx = exploredCanvas.getContext('2d')!;

// Scratch canvas where every currently-lit contribution (direct light + each mirror bounce) gets
// accumulated additively ('lighter') before being composited onto the main canvas once — so
// overlapping lit regions add brightness like real light instead of stacking translucent layers.
export const litLayer = document.createElement('canvas');
export const litCtx = litLayer.getContext('2d')!;

// Reused scratch canvas for the dim "remembered" layer
export const dimLayer = document.createElement('canvas');
export const dimCtx = dimLayer.getContext('2d')!;

export const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  exploredCanvas.width = Math.ceil(window.innerWidth * FOG_MEMORY_SCALE);
  exploredCanvas.height = Math.ceil(window.innerHeight * FOG_MEMORY_SCALE);
  exploredCtx.fillStyle = 'black';
  exploredCtx.fillRect(0, 0, exploredCanvas.width, exploredCanvas.height);
  dimLayer.width = window.innerWidth;
  dimLayer.height = window.innerHeight;
  litLayer.width = window.innerWidth;
  litLayer.height = window.innerHeight;
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keysDown.add(key);
  if (key === 'f') lightState.mode = lightState.mode === 'candle' ? 'flashlight' : 'candle';
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));

resize();

requestAnimationFrame(draw);