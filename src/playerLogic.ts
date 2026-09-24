import {
  player, GRID_SIZE, walls, mirrors, keysDown, gameState, goal, lightState, LIT_THRESHOLD, doors, FLASHLIGHT_TURN_DEG_PER_S, FLASHLIGHT_TURN_MIN_DEG_PER_S, FLASHLIGHT_TURN_RAMP_MS,
  PLAYER_SPEED, PLAYER_HALF_SIZE, footprintCells, CORNER_ASSIST, FEAR_REACH,
} from "./consts";
import { brightnessAt } from "./rayTracer";
import { tryOpenLockedDoor } from "./doorLogic";
import type { LightGroup } from "./rayTracer";
import type { GridPos, LightKind, Point } from "./interfaces";

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
  // Doors are only passable fully open. Otherwise you could light a plate, walk off, and slip
  // through while the door is still sliding shut, skipping the puzzle.
  for (const d of doors) {
    if (d.openAmount < 1 && d.cells.some(c => c.gridX === gx && c.gridY === gy)) return false;
  }
  return true;
}

// Fear rule: while empty-handed, the character only moves to points lit to LIT_THRESHOLD. Holding
// a light, you're always standing in your own light, so the rule never applies. The whole cell of
// a dropped light also counts as lit: you're right beside it, even where a flashlight's narrow
// beam hasn't widened out yet.
// To be forgiving, you count as lit if any point within FEAR_REACH of your centre is.
const besideDroppedLight = (p: Point) =>
  lightState.dropped.some(d => Math.floor(p.x / GRID_SIZE) === d.gridX && Math.floor(p.y / GRID_SIZE) === d.gridY);
const REACH_PROBES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const tooDark = (p: Point, groups: LightGroup[]) => {
  if (lightState.held || besideDroppedLight(p)) return false;
  return REACH_PROBES.every(([dx, dy]) =>
    brightnessAt({ x: p.x + dx * FEAR_REACH, y: p.y + dy * FEAR_REACH }, groups) < LIT_THRESHOLD);
}

const footprintClear = (p: Point) => footprintCells(p.x, p.y).every(c => isWalkable(c.gridX, c.gridY));

// Q/E swing the flashlight's aim around the character (anticlockwise / clockwise on screen),
// independently of movement. Starts slow so a tap is a fine adjustment, then eases up to full
// speed while held; letting go or reversing starts slow again. `dt` in seconds.
let turnDir = 0;
let turnHeldMs = 0;
export const updateAim = (dt: number) => {
  if (gameState.status !== 'playing') return;
  const turn = (keysDown.has('e') ? 1 : 0) - (keysDown.has('q') ? 1 : 0);
  if (turn !== turnDir) { turnDir = turn; turnHeldMs = 0; }
  if (turn === 0) return;
  turnHeldMs += dt * 1000;
  const ramp = Math.min(1, turnHeldMs / FLASHLIGHT_TURN_RAMP_MS) ** 2;
  const degPerS = FLASHLIGHT_TURN_MIN_DEG_PER_S + (FLASHLIGHT_TURN_DEG_PER_S - FLASHLIGHT_TURN_MIN_DEG_PER_S) * ramp;
  player.aimAngle += turn * degPerS * Math.PI / 180 * dt;
}

// Takes `kind` into hand, lit. Whatever was in hand goes into your pocket, switched off.
const takeIntoHand = (kind: LightKind) => {
  if (lightState.held) lightState.stowed.push(lightState.held);
  lightState.held = kind;
}

// Space: pick up whatever light is on your cell (a dropped one, or an unfound one, which switches
// on), or if there's nothing here, set down the light in hand and switch to the pocketed one.
// Picking up a flashlight takes on the aim it was lying with.
export const dropOrPickUpLight = () => {
  if (gameState.status !== 'playing') return;
  const onThisCell = (c: GridPos) => c.gridX === player.gridX && c.gridY === player.gridY;
  const dropped = lightState.dropped.findIndex(onThisCell);
  const pickup = lightState.pickups.findIndex(onThisCell);
  // You carry at most one of each kind. A light here you can't take blocks the cell: no picking it
  // up, and no dropping yours on top of it.
  const carrying = (kind: LightKind) => lightState.held === kind || lightState.stowed.includes(kind);
  const here = dropped >= 0 ? lightState.dropped[dropped] : pickup >= 0 ? lightState.pickups[pickup] : null;
  if (here && carrying(here.kind)) return;
  if (dropped >= 0) {
    takeIntoHand(lightState.dropped[dropped].kind);
    player.aimAngle = lightState.dropped[dropped].aimAngle;
    lightState.dropped.splice(dropped, 1);
  } else if (pickup >= 0) {
    takeIntoHand(lightState.pickups[pickup].kind);
    player.aimAngle = lightState.pickups[pickup].aimAngle;
    lightState.pickups.splice(pickup, 1);
  } else if (lightState.held) {
    lightState.dropped.push({ kind: lightState.held, gridX: player.gridX, gridY: player.gridY, aimAngle: player.aimAngle });
    // Setting a light down, you take out the one in your pocket, if you have one.
    lightState.held = lightState.stowed.shift() ?? null;
  }
}

// F: swap the light in hand for one in your pocket (or take one out, if your hand is empty).
export const swapHeldLight = () => {
  if (gameState.status !== 'playing' || lightState.stowed.length === 0) return;
  const next = lightState.stowed.shift()!;
  if (lightState.held) lightState.stowed.push(lightState.held);
  lightState.held = next;
}

// Moves the player `delta` px along one axis. Collision stays on the grid: if the footprint would
// overlap a blocked cell (wall, door not fully open), the player stops flush against it, and
// bumping a locked door tries to open it. Then the fear rule: no moving into darkness empty-handed.
// Moving the axes separately is what lets you slide along a wall (or the edge of the light).
const moveAxis = (axis: 'x' | 'y', delta: number, groups: LightGroup[], assist: boolean) => {
  if (delta === 0) return;
  const next = { x: player.x, y: player.y };
  next[axis] += delta;

  const blocked = footprintCells(next.x, next.y).filter(c => !isWalkable(c.gridX, c.gridY));
  if (blocked.length > 0) {
    for (const c of blocked) tryOpenLockedDoor(c.gridX, c.gridY);

    // Corner assist: walking straight into a wall with a gap just beside you, slide sideways
    // toward the gap (at walking speed) instead of stopping dead.
    if (assist) {
      const side = axis === 'x' ? 'y' : 'x';
      for (let s = 1; s <= CORNER_ASSIST; s++) {
        for (const sign of [1, -1]) {
          const probe = { x: next.x, y: next.y };
          probe[side] += sign * s;
          if (!footprintClear(probe)) continue;
          const nudged = { x: player.x, y: player.y };
          nudged[side] += sign * Math.min(Math.abs(delta), s);
          if (footprintClear(nudged) && !tooDark(nudged, groups)) player[side] = nudged[side];
          return;
        }
      }
    }

    const cell = (c: GridPos) => axis === 'x' ? c.gridX : c.gridY;
    const gap = PLAYER_HALF_SIZE + 0.01;
    next[axis] = delta > 0
      ? Math.max(player[axis], Math.min(...blocked.map(c => cell(c) * GRID_SIZE)) - gap)
      : Math.min(player[axis], Math.max(...blocked.map(c => (cell(c) + 1) * GRID_SIZE)) + gap);
  }

  if (tooDark(next, groups)) return;
  player[axis] = next[axis];
}

// Free movement in any direction (diagonals normalised to the same speed). `dt` in seconds;
// `groups` is the light from the last frame, used for the fear rule.
export const tryMove = (dt: number, groups: LightGroup[]) => {
  if (gameState.status !== 'playing') return;

  const held = (...keys: string[]) => keys.some(k => keysDown.has(k));
  const ix = (held('d', 'arrowright') ? 1 : 0) - (held('a', 'arrowleft') ? 1 : 0);
  const iy = (held('s', 'arrowdown') ? 1 : 0) - (held('w', 'arrowup') ? 1 : 0);
  if (ix === 0 && iy === 0) return;

  // Corner assist only when walking along one axis, so it never fights a diagonal slide.
  const straight = ix === 0 || iy === 0;
  const step = PLAYER_SPEED * dt / Math.hypot(ix, iy);
  moveAxis('x', ix * step, groups, straight);
  moveAxis('y', iy * step, groups, straight);

  player.gridX = Math.floor(player.x / GRID_SIZE);
  player.gridY = Math.floor(player.y / GRID_SIZE);
  if (player.gridX === goal.gridX && player.gridY === goal.gridY) gameState.status = 'won';
}