import {
  GRID_SIZE, LIT_THRESHOLD, FLASHLIGHT_TURN_DEG_PER_S, FLASHLIGHT_TURN_MIN_DEG_PER_S, FLASHLIGHT_TURN_RAMP_MS, FACING_TURN_DEG_PER_S,
  WALK_FACING_TOLERANCE_DEG,
  PLAYER_SPEED, PLAYER_HALF_SIZE, CORNER_ASSIST, FEAR_REACH, MIRROR_THICKNESS, MIRROR_STEPS, MIRROR_STEP_MS,
  MIRROR_REACH, MIRROR_REACH_FACING_DEG,
} from "./consts";
import { player, walls, keysDown, gameState, goal, lightState, doors, mirrors, levers, footprintCells } from "./state";
import type { MirrorState } from "./state";
import { brightnessAt } from "./rayTracer";
import { tryOpenLockedDoor } from "./doorLogic";
import type { LightGroup } from "./rayTracer";
import type { FloorLight, GridPos, LightKind, Point } from "./interfaces";
import { cellCenter, mirrorSegment, sameCell, segmentNearSquare } from "./util";

// Walls and doors that aren't fully open block whole cells. (A door you could slip through while
// it slides shut would let you light a plate, walk off, and skip the puzzle.)
export const isWalkable = (gx: number, gy: number): boolean => {
  const { x, y } = cellCenter({ gridX: gx, gridY: gy });
  if (walls.some(w => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h)) return false;
  return !doors.some(d => d.openAmount < 1 && d.cells.some(c => c.gridX === gx && c.gridY === gy));
}

// Mirrors block only as thin segments, so you can walk past one that's turned edge-on.
const hitsMirror = (p: Point) =>
  mirrors.some(m => segmentNearSquare(mirrorSegment(m, m.shownStep), p, PLAYER_HALF_SIZE, MIRROR_THICKNESS / 2));

const footprintClear = (p: Point) =>
  footprintCells(p.x, p.y).every(c => isWalkable(c.gridX, c.gridY)) && !hitsMirror(p);

// Fear rule: empty-handed, you only move to points lit to LIT_THRESHOLD. You count as lit if any
// point within FEAR_REACH of your centre is, or you're in the cell of a dropped light (a dropped
// flashlight's beam is too narrow there to count otherwise).
const REACH_PROBES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const tooDark = (p: Point, groups: LightGroup[]) => {
  if (lightState.held) return false;
  const cell = { gridX: Math.floor(p.x / GRID_SIZE), gridY: Math.floor(p.y / GRID_SIZE) };
  if (lightState.dropped.some(d => sameCell(d, cell))) return false;
  return REACH_PROBES.every(([dx, dy]) =>
    brightnessAt({ x: p.x + dx * FEAR_REACH, y: p.y + dy * FEAR_REACH }, groups) < LIT_THRESHOLD);
}

// The flashlight faces the way you're walking (`walkAngle`, null when standing still), swinging
// round at FACING_TURN_DEG_PER_S. Standing still, Q/E aim it: slow at first so a tap is a fine
// adjustment, then easing up to full speed while held. `dt` in seconds.
let turnDir = 0;
let turnHeldMs = 0;
const angleBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const updateAim = (dt: number, walkAngle: number | null) => {
  if (gameState.status !== 'playing') return;
  if (walkAngle !== null) {
    const off = angleBetween(player.aimAngle, walkAngle);
    const maxTurn = FACING_TURN_DEG_PER_S * Math.PI / 180 * dt;
    player.aimAngle += Math.max(-maxTurn, Math.min(maxTurn, off));
    turnDir = 0;
    return;
  }
  const turn = (keysDown.has('e') ? 1 : 0) - (keysDown.has('q') ? 1 : 0);
  if (turn !== turnDir) { turnDir = turn; turnHeldMs = 0; }
  if (turn === 0) return;
  turnHeldMs += dt * 3000;
  const ramp = Math.min(1, turnHeldMs / FLASHLIGHT_TURN_RAMP_MS) ** 2;
  const degPerS = FLASHLIGHT_TURN_MIN_DEG_PER_S + (FLASHLIGHT_TURN_DEG_PER_S - FLASHLIGHT_TURN_MIN_DEG_PER_S) * ramp;
  player.aimAngle += turn * degPerS * Math.PI / 180 * dt;
}

// Takes `kind` into hand, lit; whatever was in hand goes into your pocket.
const takeIntoHand = (kind: LightKind) => {
  if (lightState.held) lightState.stowed.push(lightState.held);
  lightState.held = kind;
}

// A light on your cell (dropped, or unfound), or null. You carry at most one of each kind, so a light
// here you can't take blocks the cell: no picking it up (`blocked`), and no dropping yours on top of it.
const lightOnCell = () => {
  const carrying = (kind: LightKind) => lightState.held === kind || lightState.stowed.includes(kind);
  for (const list of [lightState.dropped, lightState.pickups]) {
    const i = list.findIndex(c => sameCell(c, player));
    if (i >= 0) return { list, i, blocked: carrying(list[i].kind) };
  }
  return null;
}

// Picks up the light (an unfound one switches on), taking its aim.
const pickUpLight = ({ list, i }: { list: FloorLight[]; i: number }) => {
  takeIntoHand(list[i].kind);
  player.aimAngle = list[i].aimAngle;
  list.splice(i, 1);
}

// Sets down the light in hand and takes out the pocketed one.
const dropLight = () => {
  if (!lightState.held) return;
  lightState.dropped.push({ kind: lightState.held, gridX: player.gridX, gridY: player.gridY, aimAngle: player.aimAngle });
  lightState.held = lightState.stowed.shift() ?? null;
}

// The turnable mirror you're facing, close by (the nearest to straight ahead), if any.
const facedMirror = () => {
  let best: MirrorState | null = null, bestOff = MIRROR_REACH_FACING_DEG * Math.PI / 180;
  for (const m of mirrors) {
    if (m.control !== 'turnable') continue;
    const c = cellCenter(m);
    if (Math.hypot(c.x - player.x, c.y - player.y) > MIRROR_REACH) continue;
    const off = Math.abs(angleBetween(player.aimAngle, Math.atan2(c.y - player.y, c.x - player.x)));
    if (off <= bestOff) { best = m; bestOff = off; }
  }
  return best;
}

// F: swap the light in hand for one in your pocket (or take one out, if your hand is empty).
export const swapHeldLight = () => {
  if (gameState.status !== 'playing' || lightState.stowed.length === 0) return;
  const next = lightState.stowed.shift()!;
  if (lightState.held) lightState.stowed.push(lightState.held);
  lightState.held = next;
}

// Turns a mirror a step, skipping any angle that would leave it in the player. It swings round to
// there over MIRROR_STEP_MS per step (see updateMirrors). You caused the turn, so you see it through,
// even the parts of the mirror in fog.
const turnMirror = (m: MirrorState) => {
  for (let s = 1; s < MIRROR_STEPS; s++) {
    const next = (m.step + s) % MIRROR_STEPS;
    if (segmentNearSquare(mirrorSegment(m, next), player, PLAYER_HALF_SIZE, MIRROR_THICKNESS / 2)) continue;
    m.step = next;
    m.turnLeft += s;
    m.followTurn = true;
    return;
  }
}

// Swings turning mirrors on toward their step. `dt` in seconds.
export const updateMirrors = (dt: number) => {
  for (const m of mirrors) {
    if (m.turnLeft <= 0) continue;
    const d = Math.min(m.turnLeft, dt * 1000 / MIRROR_STEP_MS);
    m.turnLeft -= d;
    m.shownStep = m.turnLeft > 0 ? (m.shownStep + d) % MIRROR_STEPS : m.step;
    if (m.followTurn) m.seenStep = m.shownStep;
    if (m.turnLeft <= 0) m.followTurn = false;
  }
}

// Space, the one action key, doing the first of: pull a lever in your cell (toggling its door and
// turning its mirrors); turn a turnable mirror in your cell; pick up a light on your cell; turn a
// turnable mirror you're facing close by (so pressing Space at one never drops your light by
// mistake); drop your light.
export const act = () => {
  if (gameState.status !== 'playing') return;
  const lever = levers.find(l => sameCell(l, player));
  if (lever) {
    lever.on = !lever.on;
    for (const m of mirrors) if (m.control === lever.id) turnMirror(m);
    return;
  }
  const mirrorHere = mirrors.find(m => m.control === 'turnable' && sameCell(m, player));
  if (mirrorHere) return turnMirror(mirrorHere);
  const light = lightOnCell();
  if (light) {
    if (!light.blocked) pickUpLight(light);
    return;
  }
  const faced = facedMirror();
  if (faced) turnMirror(faced);
  else dropLight();
}

// Moves the player `delta` px along one axis. Blocked by walls, closed doors (stopping flush
// against them, and bumping a locked door tries to open it) and mirrors, then by the fear rule.
// Moving the axes separately is what lets you slide along a wall or the edge of the light.
const moveAxis = (axis: 'x' | 'y', delta: number, groups: LightGroup[], assist: boolean) => {
  if (delta === 0) return;
  const next = { x: player.x, y: player.y };
  next[axis] += delta;

  const blocked = footprintCells(next.x, next.y).filter(c => !isWalkable(c.gridX, c.gridY));
  if (blocked.length > 0) {
    for (const c of blocked) tryOpenLockedDoor(c.gridX, c.gridY);

    // Corner assist: walking straight into a wall with a gap just beside you, slide sideways
    // toward the gap instead of stopping dead.
    if (assist) {
      const side = axis === 'x' ? 'y' : 'x';
      for (let s = 1; s <= CORNER_ASSIST; s++) {
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

    const cell = (c: GridPos) => axis === 'x' ? c.gridX : c.gridY;
    const gap = PLAYER_HALF_SIZE + 0.01;
    next[axis] = delta > 0
      ? Math.max(player[axis], Math.min(...blocked.map(c => cell(c) * GRID_SIZE)) - gap)
      : Math.min(player[axis], Math.max(...blocked.map(c => (cell(c) + 1) * GRID_SIZE)) + gap);
  }

  if (hitsMirror(next) || tooDark(next, groups)) return;
  player[axis] = next[axis];
}

// Free movement in any direction (diagonals normalised). `dt` in seconds; `groups` is last frame's
// light, for the fear rule. Returns the direction you're trying to walk (even if blocked), or null.
export const tryMove = (dt: number, groups: LightGroup[]): number | null => {
  if (gameState.status !== 'playing') return null;

  const held = (...keys: string[]) => keys.some(k => keysDown.has(k));
  const ix = (held('d', 'arrowright') ? 1 : 0) - (held('a', 'arrowleft') ? 1 : 0);
  const iy = (held('s', 'arrowdown') ? 1 : 0) - (held('w', 'arrowup') ? 1 : 0);
  if (ix === 0 && iy === 0) return null;

  // Turn to face the way you want to go before setting off.
  const walkAngle = Math.atan2(iy, ix);
  if (Math.abs(angleBetween(player.aimAngle, walkAngle)) > WALK_FACING_TOLERANCE_DEG * Math.PI / 180) return walkAngle;

  const straight = ix === 0 || iy === 0; // corner assist only along one axis, so it never fights a diagonal slide
  const step = PLAYER_SPEED * dt / Math.hypot(ix, iy);
  moveAxis('x', ix * step, groups, straight);
  moveAxis('y', iy * step, groups, straight);

  player.gridX = Math.floor(player.x / GRID_SIZE);
  player.gridY = Math.floor(player.y / GRID_SIZE);
  if (sameCell(player, goal)) gameState.status = 'won';
  return walkAngle;
}
