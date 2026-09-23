import { player, GRID_SIZE, MOVE_SPEED, walls, MOVE_COOLDOWN, mirrors, keysDown } from "./consts";

player.visualX = player.gridX * GRID_SIZE + GRID_SIZE / 2;
player.visualY = player.gridY * GRID_SIZE + GRID_SIZE / 2;


// `dt` in seconds. Scaled by frame time rather than a fixed per-frame step, so the glide speed
// stays the same whatever the frame rate cap is.
export const updateVisual = (dt: number) => {
  const targetX = player.gridX * GRID_SIZE + GRID_SIZE / 2;
  const targetY = player.gridY * GRID_SIZE + GRID_SIZE / 2;
  const step = Math.min(1, MOVE_SPEED * dt);
  player.visualX += (targetX - player.visualX) * step;
  player.visualY += (targetY - player.visualY) * step;
}

const pointSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}


export const isWalkable = (gx: number, gy: number): boolean => {
  const px = gx * GRID_SIZE + GRID_SIZE / 2;
  const py = gy * GRID_SIZE + GRID_SIZE / 2;
  for (const w of walls) {
    if (px > w.x && px < w.x + w.w && py > w.y && py < w.y + w.h) return false;
  }
  for (const m of mirrors) {
    if (pointSegmentDistance(px, py, m.x1, m.y1, m.x2, m.y2) < GRID_SIZE / 2) return false;
  }
  return true;
}

let lastMoveTime = 0

export const tryMove = (now: number) => {
  if (now - lastMoveTime < MOVE_COOLDOWN) return;

  let dx = 0, dy = 0;
  if (keysDown.has('w') || keysDown.has('arrowup')) dy = -1;
  else if (keysDown.has('s') || keysDown.has('arrowdown')) dy = 1;
  else if (keysDown.has('a') || keysDown.has('arrowleft')) dx = -1;
  else if (keysDown.has('d') || keysDown.has('arrowright')) dx = 1;

  if (dx === 0 && dy === 0) return;

  // Update facing even if the move itself is blocked, so you can turn the flashlight toward
  // a wall without needing to actually step into it.
  player.facingAngle = Math.atan2(dy, dx);

  const newX = player.gridX + dx;
  const newY = player.gridY + dy;

  if (isWalkable(newX, newY)) {
    player.gridX = newX;
    player.gridY = newY;
    lastMoveTime = now;
  }
}