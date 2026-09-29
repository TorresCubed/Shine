import {
  GRID_SIZE, LIT_THRESHOLD, FLASHLIGHT_TURN_DEG_PER_S, FLASHLIGHT_TURN_MIN_DEG_PER_S, FLASHLIGHT_TURN_RAMP_MS, FACING_TURN_DEG_PER_S,
  WALK_FACING_TOLERANCE_DEG,
  PLAYER_SPEED, PLAYER_HALF_SIZE, CORNER_ASSIST, FEAR_REACH, MIRROR_PIVOT_RADIUS, MIRROR_STEPS, MIRROR_STEP_MS, DOOR_THICKNESS,
  MIRROR_REACH, MIRROR_REACH_FACING_DEG, TAP_REACH, TAP_PLAYER_RADIUS, PICKUP_RADIUS, STICK_DEAD_ZONE, STICK_WALK, STICK_SNAP_DEG, SLIDE_STEP_DEG, SLIDE_MAX_DEG,
} from "./consts";
import { player, levelWalls, keysDown, stick, gameState, goal, lightState, doors, mirrors, levers, footprintCells, doorLeaves, allDoorLeaves, punch, shine } from "./state";
import type { LeverState, MirrorState } from "./state";
import { brightnessAt } from "./rayTracer";
import { tryOpenLockedDoor } from "./doorLogic";
import type { LightGroup } from "./rayTracer";
import type { FloorLight, GridPos, LightKind, Point } from "./interfaces";
import { cellCenter, sameCell, segmentNearSquare, segmentsCross } from "./util";

// Walls block whole cells.
const inWall = (p: Point) => levelWalls.some(w => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h);
const isWalkable = (gx: number, gy: number) => !inWall(cellCenter({ gridX: gx, gridY: gy }));

// Mirrors block only at their pivot, a small round post in the middle of the cell, so you can walk
// right up to and around one (over its ends) to get at it.
const hitsMirror = (p: Point) => mirrors.some(m => {
  const c = cellCenter(m);
  const dx = Math.max(0, Math.abs(p.x - c.x) - PLAYER_HALF_SIZE), dy = Math.max(0, Math.abs(p.y - c.y) - PLAYER_HALF_SIZE);
  return Math.hypot(dx, dy) < MIRROR_PIVOT_RADIUS;
});

// The door you'd bump into at `p`, if any: its leaves where they are, and, until it's fully open,
// the whole of each edge it closes (a door you could slip through mid-swing would let you light a
// plate, walk off, and skip the puzzle).
const doorAt = (p: Point) => doors.find(d => [...doorLeaves(d, d.openAmount), ...(d.openAmount < 1 ? doorLeaves(d, 0) : [])]
  .some(s => segmentNearSquare(s, p, PLAYER_HALF_SIZE, DOOR_THICKNESS / 2)));

const footprintClear = (p: Point) =>
  footprintCells(p.x, p.y).every(c => isWalkable(c.gridX, c.gridY)) && !hitsMirror(p) && !doorAt(p);

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

// The light on the floor (dropped, or unfound) within PICKUP_RADIUS of you, or null: one you can take
// if there is one, else the nearest. It goes by where the light lies, not its cell, so one dropped
// at a cell's edge is as easy to reach from the next cell. You carry at most one of each kind, so a
// light here you can't take is `blocked`: no picking it up, and no dropping yours on top of it.
const lightInReach = () => {
  const carrying = (kind: LightKind) => lightState.held === kind || lightState.stowed.includes(kind);
  let best: { list: FloorLight[]; i: number; blocked: boolean; dist: number } | null = null;
  for (const list of [lightState.dropped, lightState.pickups]) {
    for (let i = 0; i < list.length; i++) {
      const l = list[i], dist = Math.hypot(l.x - player.x, l.y - player.y), blocked = carrying(l.kind);
      if (dist > PICKUP_RADIUS) continue;
      if (!best || (best.blocked && !blocked) || (best.blocked === blocked && dist < best.dist)) best = { list, i, blocked, dist };
    }
  }
  return best;
}

// Picks up the light (an unfound one switches on), taking its aim.
const pickUpLight = ({ list, i }: { list: FloorLight[]; i: number }) => {
  takeIntoHand(list[i].kind);
  player.aimAngle = list[i].aimAngle;
  shine(list[i].x, list[i].y);
  list.splice(i, 1);
}

// Sets down the light in hand and takes out the pocketed one. Never on a plate (a light has to be
// shone onto a plate from somewhere, or the puzzles would all come down to "put it on the plate"),
// a mirror or a lever, turnable or not: those cells are for the thing already there.
const dropLight = () => {
  if (!lightState.held) return;
  if (doors.some(d => d.kind !== 'lever' && sameCell(d.trigger, player))) return;
  if (mirrors.some(m => sameCell(m, player)) || levers.some(l => sameCell(l, player))) return;
  // It lands where you stand, not snapped to the middle of the cell.
  lightState.dropped.push({ kind: lightState.held, gridX: player.gridX, gridY: player.gridY, x: player.x, y: player.y, aimAngle: player.aimAngle });
  lightState.held = lightState.stowed.shift() ?? null;
  shine(player.x, player.y);
}

// Whether a cell's centre is within `reach` of you, with no wall or door in between.
const withinReach = (cell: GridPos, reach: number) => {
  const c = cellCenter(cell);
  if (Math.hypot(c.x - player.x, c.y - player.y) > reach) return false;
  const between = (t: number) => ({ x: player.x + (c.x - player.x) * t, y: player.y + (c.y - player.y) * t });
  if ([0.25, 0.5, 0.75].some(t => inWall(between(t)))) return false;
  return !allDoorLeaves().some(s => segmentsCross(s, { x1: player.x, y1: player.y, x2: c.x, y2: c.y }));
}

// The turnable mirror you're facing, close by with no wall or door in between (the nearest to
// straight ahead), if any.
const facedMirror = () => {
  let best: MirrorState | null = null, bestOff = MIRROR_REACH_FACING_DEG * Math.PI / 180;
  for (const m of mirrors) {
    if (m.control !== 'turnable' || !withinReach(m, MIRROR_REACH)) continue;
    const c = cellCenter(m);
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
  punch('player');
}

// Turns a mirror a step. It swings round to there over MIRROR_STEP_MS per step (see updateMirrors),
// passing over you if you're beside it: only its pivot blocks you. If you've seen it before, you see
// it turn, even in fog (see updateMirrors).
const turnMirror = (m: MirrorState) => {
  m.turnLeft += 1; // mid-swing, this just moves the finish further on: it keeps its speed
  m.step = (m.step + 1) % MIRROR_STEPS;
}

// Swings turning mirrors on toward their step with momentum: speeding up evenly, then slowing so it
// comes to rest exactly on the step, so a swing eases in and out, and more turns asked for mid-swing
// carry it on without stopping. The acceleration makes a single step take MIRROR_STEP_MS; longer
// turns get up to speed, so each extra step takes less. `dt` in seconds.
export const updateMirrors = (dt: number) => {
  const accel = 4 / (MIRROR_STEP_MS / 1000) ** 2; // steps/s²: one step, speeding up then slowing, in MIRROR_STEP_MS
  for (const m of mirrors) {
    if (m.turnLeft <= 0) continue;
    const stoppable = Math.sqrt(2 * accel * m.turnLeft); // the fastest it can go and still stop in time
    m.turnSpeed = Math.min(stoppable, m.turnSpeed + accel * dt);
    const d = Math.min(m.turnLeft, Math.max(m.turnSpeed * dt, 1e-4));
    m.turnLeft -= d;
    m.shownStep = (m.shownStep + d) % MIRROR_STEPS;
    const done = m.turnLeft <= 1e-4;
    if (done) { m.shownStep = m.step; m.turnLeft = m.turnSpeed = 0; }
    if (m.everSeen) m.seenStep = m.shownStep; // a mirror you know about, you see turn, whatever turned it
  }
}

// Space, the one action key, doing the first of: pull a lever in your cell (toggling its door and
// turning its mirrors); turn a turnable mirror in your cell; pick up a light on your cell; turn a
// turnable mirror you're facing close by (so pressing Space at one never drops your light by
// mistake); drop your light.
export const act = () => {
  if (gameState.status !== 'playing') return;
  const lever = levers.find(l => sameCell(l, player));
  if (lever) return pullLever(lever);
  const mirrorHere = mirrors.find(m => m.control === 'turnable' && sameCell(m, player));
  if (mirrorHere) return turnMirror(mirrorHere);
  const light = lightInReach();
  if (light) {
    if (!light.blocked) pickUpLight(light);
    return;
  }
  const faced = facedMirror();
  if (faced) turnMirror(faced);
  else dropLight();
}

// Toggles a lever (and its door), turning the mirrors linked to it a step.
const pullLever = (lever: LeverState) => {
  lever.on = !lever.on;
  lever.pulled = true;
  punch(`lever ${lever.gridX},${lever.gridY}`);
  for (const m of mirrors) if (m.control === lever.id) turnMirror(m);
}

// A tap (or click) at world point `p`: on yourself, pick up the light on your cell or drop yours;
// on a lever or turnable mirror within TAP_REACH, pull or turn it. Anywhere else does nothing.
export const tapAt = (p: Point) => {
  if (gameState.status !== 'playing') return;
  if (Math.hypot(p.x - player.x, p.y - player.y) <= TAP_PLAYER_RADIUS) {
    const light = lightInReach();
    if (!light) dropLight();
    else if (!light.blocked) pickUpLight(light);
    return;
  }
  const cell = { gridX: Math.floor(p.x / GRID_SIZE), gridY: Math.floor(p.y / GRID_SIZE) };
  const lever = levers.find(l => sameCell(l, cell));
  if (lever) {
    if (withinReach(lever, TAP_REACH)) pullLever(lever);
    return;
  }
  const mirror = mirrors.find(m => m.control === 'turnable' && sameCell(m, cell));
  if (mirror && withinReach(mirror, TAP_REACH)) turnMirror(mirror);
}

// Moves the player `delta` px along one axis. Blocked by walls (stopping flush against them), doors
// and mirrors (stopping just short; bumping a locked door tries to open it), then by the fear rule.
// Moving the axes separately is what lets you slide along a wall or the edge of the light.
const moveAxis = (axis: 'x' | 'y', delta: number, groups: LightGroup[], assist: boolean) => {
  if (delta === 0) return;
  let next = { x: player.x, y: player.y };
  next[axis] += delta;

  const blocked = footprintCells(next.x, next.y).filter(c => !isWalkable(c.gridX, c.gridY));
  if (blocked.length > 0) {
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

  // Thin things (doors, mirrors): close the gap in halving steps, rather than stopping a whole step short.
  const door = doorAt(next);
  if (door) tryOpenLockedDoor(door);
  if (door || hitsMirror(next)) {
    let d = next[axis] - player[axis];
    for (let i = 0; i < 5; i++) {
      d /= 2;
      const q = { x: player.x, y: player.y };
      q[axis] += d;
      if (!doorAt(q) && !hitsMirror(q)) { next = q; break; }
      if (i === 4) return;
    }
  }
  if (tooDark(next, groups)) return;
  player[axis] = next[axis];
}

// Stopped dead walking at `angle` (by the dark, a mirror's pivot, a slanted door leaf; anything the
// axis-by-axis move can't slide along): try heading off a little to either side, turning further
// and further up to SLIDE_MAX_DEG, and take the first way that's clear. It moves only as much of
// the `dist` as points that way (cos of the turn), so you glide along an edge you walk into at a
// slant, quicker the shallower the slant, and stay put walking square into one.
const slide = (angle: number, dist: number, groups: LightGroup[]) => {
  for (let deg = SLIDE_STEP_DEG; deg <= SLIDE_MAX_DEG; deg += SLIDE_STEP_DEG) {
    const len = dist * Math.cos(deg * Math.PI / 180);
    for (const sign of [1, -1]) {
      const a = angle + sign * deg * Math.PI / 180;
      const next = { x: player.x + Math.cos(a) * len, y: player.y + Math.sin(a) * len };
      if (!footprintClear(next) || tooDark(next, groups)) continue;
      player.x = next.x;
      player.y = next.y;
      return;
    }
  }
}

// Where the on-screen stick says to go: a unit direction, the speed as a fraction of PLAYER_SPEED,
// and whether it's pushed far enough to walk rather than just turn. Walking, the direction snaps to
// straight or diagonal when close; the way to face (`face`) always follows the stick exactly, so a
// sweep of the beam is smooth. Null when it's let go or barely pushed.
const stickMove = () => {
  const amount = Math.min(1, Math.hypot(stick.x, stick.y));
  if (amount < STICK_DEAD_ZONE) return null;
  const walk = amount >= STICK_WALK;
  const face = Math.atan2(stick.y, stick.x);
  let angle = face;
  const eighth = Math.PI / 4, snapped = Math.round(angle / eighth) * eighth;
  if (walk && Math.abs(angle - snapped) <= STICK_SNAP_DEG * Math.PI / 180) angle = snapped;
  const exact = (v: number) => Math.abs(v) < 1e-9 ? 0 : v; // so straight really is straight
  return { ix: exact(Math.cos(angle)), iy: exact(Math.sin(angle)), speed: amount, walk, face };
}

// Free movement in any direction, from the keys (diagonals normalised) or the on-screen stick. `dt`
// in seconds; `groups` is last frame's light, for the fear rule. Returns the direction you're trying
// to walk (or, with the stick barely pushed, to face), even if blocked, or null.
export const tryMove = (dt: number, groups: LightGroup[]): number | null => {
  if (gameState.status !== 'playing') return null;

  const held = (...keys: string[]) => keys.some(k => keysDown.has(k));
  let ix = (held('d', 'arrowright') ? 1 : 0) - (held('a', 'arrowleft') ? 1 : 0);
  let iy = (held('s', 'arrowdown') ? 1 : 0) - (held('w', 'arrowup') ? 1 : 0);
  let speed = 1, walk = true, face: number | null = null;
  if (ix === 0 && iy === 0) {
    const s = stickMove();
    if (!s) return null;
    ({ ix, iy, speed, walk, face } = s);
  }

  // Turn to face the way you want to go before setting off. (With the stick, the way it points, which
  // the walk may be snapped a little off.)
  const walkAngle = face ?? Math.atan2(iy, ix);
  if (!walk || Math.abs(angleBetween(player.aimAngle, walkAngle)) > WALK_FACING_TOLERANCE_DEG * Math.PI / 180) return walkAngle;

  const straight = ix === 0 || iy === 0; // corner assist only along one axis, so it never fights a diagonal slide
  const step = PLAYER_SPEED * speed * dt / Math.hypot(ix, iy);
  const before = { x: player.x, y: player.y };
  moveAxis('x', ix * step, groups, straight);
  moveAxis('y', iy * step, groups, straight);
  if (player.x === before.x && player.y === before.y) slide(walkAngle, step * Math.hypot(ix, iy), groups);

  player.gridX = Math.floor(player.x / GRID_SIZE);
  player.gridY = Math.floor(player.y / GRID_SIZE);
  if (sameCell(player, goal)) gameState.status = 'won';
  return walkAngle;
}
