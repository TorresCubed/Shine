import type { Mirror } from "./interfaces";

export const MOVE_COOLDOWN = 150; // ms between grid steps, prevents instant multi-tile jumps
export const LIGHT_RADIUS = 250;
export const GRID_SIZE = 50;
export const MOVE_SPEED = 8; // higher = snappier interpolation, lower = more floaty


export const keysDown = new Set<string>();
export const player = {
  gridX: 8,   // logical grid position (integer cells)
  gridY: 7,
  visualX: 0, // pixel position, smoothly follows gridX/gridY
  visualY: 0,
};
export const walls = [
  { x: 400, y: 300, w: 150, h: 40 },
  { x: 200, y: 450, w: 40, h: 200 },
  { x: 600, y: 150, w: 40, h: 300 },
];
export const mirrors: Mirror[] = [
  { x1: 500, y1: 500, x2: 560, y2: 460 },
];


