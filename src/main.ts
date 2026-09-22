import { keysDown } from "./consts";
import { draw } from "./renderer";

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

// Persistent canvas: accumulates every area ever lit, never cleared
export const exploredCanvas = document.createElement('canvas');
export const exploredCtx = exploredCanvas.getContext('2d')!;

export const reflectionCanvas = document.createElement('canvas');
export const reflectionCtx = reflectionCanvas.getContext('2d')!;

// Reused scratch canvas for the dim "remembered" layer
export const dimLayer = document.createElement('canvas');
export const dimCtx = dimLayer.getContext('2d')!;

export const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  exploredCanvas.width = window.innerWidth;
  exploredCanvas.height = window.innerHeight;
  dimLayer.width = window.innerWidth;
  dimLayer.height = window.innerHeight;
  reflectionCanvas.width = window.innerWidth;
  reflectionCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => keysDown.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));

resize();

draw();