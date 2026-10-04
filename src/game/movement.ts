import { GRID_SIZE, PLAYER, INPUT } from '../core/consts';
import { level, player, keysDown, stick, gameState, lightState } from '../core/state';
import { fearLit } from '../light/brightness';
import type { LightGroup } from '../light/rayTracer';
import { tryOpenLockedDoor } from './doors';
import type { GridPos, Point } from '../core/types';
import { cellAt, footprintCells, sameCell, wrapAngle } from '../core/util';
import { doorAt, footprintClear, hitsMirror, isWalkable } from './collision';

// The fear rule. A dropped light's own cell always passes: a flashlight's beam is too narrow there.
const tooDark = (p: Point, groups: LightGroup[]) => {
  if (lightState.held.value) return false;
  const cell = cellAt(p);
  return !lightState.dropped.some(d => sameCell(d, cell)) && !fearLit(p, groups);
};

// When the dark last stopped you (performance.now() clock), for the restart hint.
export const fear = { stoppedAt: -Infinity };

// Moves `delta` px along one axis: stopped flush by walls, just short of doors and mirrors (bumping a
// locked door tries it), then by the fear rule. One axis at a time lets you slide along walls.
const moveAxis = (axis: 'x' | 'y', delta: number, groups: LightGroup[], assist: boolean) => {
  if (delta === 0) return;
  let next = { x: player.x, y: player.y };
  next[axis] += delta;

  const blocked = footprintCells(next.x, next.y).filter(c => !isWalkable(c));
  if (blocked.length > 0) {
    // Corner assist: walking into a wall with a gap just beside you, step sideways toward the gap.
    if (assist) {
      const side = axis === 'x' ? 'y' : 'x';
      for (let s = 1; s <= PLAYER.cornerAssist; s++) {
        for (const sign of [1, -1]) {
          const probe = { ...next };
          probe[side] += sign * s;
          if (!footprintClear(probe)) continue;
          const nudged = { x: player.x, y: player.y };
          nudged[side] += sign * Math.min(Math.abs(delta), s);
          if (footprintClear(nudged) && !tooDark(nudged, groups)) player[side] = nudged[side];
          return;
        }
      }
    }

    const cell = (c: GridPos) => (axis === 'x' ? c.gridX : c.gridY);
    const gap = PLAYER.collisionRadius + 0.01;
    next[axis] =
      delta > 0
        ? Math.max(player[axis], Math.min(...blocked.map(c => cell(c) * GRID_SIZE)) - gap)
        : Math.min(player[axis], Math.max(...blocked.map(c => (cell(c) + 1) * GRID_SIZE)) + gap);
  }

  // Doors and mirrors are thin: close the gap in halving steps.
  const door = doorAt(next);
  if (door) tryOpenLockedDoor(door);
  if (door || hitsMirror(next)) {
    let d = next[axis] - player[axis];
    for (let i = 0; i < 5; i++) {
      d /= 2;
      const q = { x: player.x, y: player.y };
      q[axis] += d;
      if (!doorAt(q) && !hitsMirror(q)) {
        next = q;
        break;
      }
      if (i === 4) return;
    }
  }
  if (tooDark(next, groups)) {
    fear.stoppedAt = performance.now();
    return;
  }
  player[axis] = next[axis];
};

// Stopped dead at `angle` (by the dark, a pivot, a slanted door): take the first clear heading up to
// PLAYER.slideMaxDeg either side, moving the cos of the turn, so you glide along a slanted edge.
const slide = (angle: number, dist: number, groups: LightGroup[]) => {
  for (let deg = PLAYER.slideStepDeg; deg <= PLAYER.slideMaxDeg; deg += PLAYER.slideStepDeg) {
    const len = dist * Math.cos((deg * Math.PI) / 180);
    for (const sign of [1, -1]) {
      const a = angle + (sign * deg * Math.PI) / 180;
      const next = { x: player.x + Math.cos(a) * len, y: player.y + Math.sin(a) * len };
      if (!footprintClear(next) || tooDark(next, groups)) continue;
      player.x = next.x;
      player.y = next.y;
      return;
    }
  }
};

// The stick's direction (snapped to straight or diagonal when walking), speed (0-1), whether it's
// pushed far enough to walk, and `face`, its exact direction. Null when barely pushed.
const stickMove = () => {
  const amount = Math.min(1, Math.hypot(stick.x, stick.y));
  if (amount < INPUT.stick.deadZone) return null;
  const walk = amount >= INPUT.stick.walk;
  const face = Math.atan2(stick.y, stick.x);
  let angle = face;
  const eighth = Math.PI / 4;
  const snapped = Math.round(angle / eighth) * eighth;
  if (walk && Math.abs(angle - snapped) <= (INPUT.stick.snapDeg * Math.PI) / 180) angle = snapped;
  const exact = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v); // so straight is exactly straight
  return { ix: exact(Math.cos(angle)), iy: exact(Math.sin(angle)), speed: amount, walk, face };
};

// Walks from the keys or the stick, using last frame's light (`groups`) for the fear rule. Returns the
// direction you're trying to go (even if blocked), or null.
export const tryMove = (dt: number, groups: LightGroup[]): number | null => {
  if (gameState.status.value !== 'playing') return null;

  const held = (...keys: string[]) => keys.some(k => keysDown.has(k));
  let ix = (held('d', 'arrowright') ? 1 : 0) - (held('a', 'arrowleft') ? 1 : 0);
  let iy = (held('s', 'arrowdown') ? 1 : 0) - (held('w', 'arrowup') ? 1 : 0);
  let speed = 1;
  let walk = true;
  let face: number | null = null;
  if (ix === 0 && iy === 0) {
    const s = stickMove();
    if (!s) return null;
    ({ ix, iy, speed, walk, face } = s);
  }

  // Face the way you're going before setting off.
  const walkAngle = face ?? Math.atan2(iy, ix);
  if (!walk || Math.abs(wrapAngle(walkAngle - player.aimAngle)) > (PLAYER.walkFacingTolDeg * Math.PI) / 180)
    return walkAngle;

  const straight = ix === 0 || iy === 0; // corner assist only when walking straight
  const step = (PLAYER.speed * speed * dt) / Math.hypot(ix, iy);
  const before = { x: player.x, y: player.y };
  moveAxis('x', ix * step, groups, straight);
  moveAxis('y', iy * step, groups, straight);
  if (player.x === before.x && player.y === before.y) slide(walkAngle, step * Math.hypot(ix, iy), groups);

  Object.assign(player, cellAt(player));
  if (sameCell(player, level.goal)) gameState.status.value = 'won';
  return walkAngle;
};
