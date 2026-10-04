import { PLAYER, MIRROR, INPUT } from '../core/consts';
import { level, player, gameState, lightState, allDoorLeaves, shine } from '../core/state';
import type { FloorLight, GridPos, LeverState, LightKind, MirrorState, Point } from '../core/types';
import { cellAt, cellCenter, insideWalls, sameCell, segmentsCross, wrapAngle } from '../core/util';
import { turnMirror } from './mirrors';

// Takes `kind` into hand; whatever was in hand goes in your pocket.
const takeIntoHand = (kind: LightKind) => {
  const { held, stowed } = lightState;
  if (held.value) stowed.value = [...stowed.value, held.value];
  held.value = kind;
};

// Takes the first light out of your pocket, or null.
const takeFromPocket = () => {
  const [first = null, ...rest] = lightState.stowed.value;
  lightState.stowed.value = rest;
  return first;
};

// The floor light within PLAYER.pickupRadius: one you can take if any, else the nearest. One of a kind
// you already carry is `blocked`: no picking it up, or dropping yours on it.
const lightInReach = () => {
  const carrying = (kind: LightKind) => lightState.held.value === kind || lightState.stowed.value.includes(kind);
  let best: { list: FloorLight[]; i: number; blocked: boolean; dist: number } | null = null;
  for (const list of [lightState.dropped, lightState.pickups]) {
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const dist = Math.hypot(l.x - player.x, l.y - player.y);
      const blocked = carrying(l.kind);
      if (dist > PLAYER.pickupRadius) continue;
      if (!best || (best.blocked && !blocked) || (best.blocked === blocked && dist < best.dist))
        best = { list, i, blocked, dist };
    }
  }
  return best;
};

const pickUpLight = ({ list, i }: { list: FloorLight[]; i: number }) => {
  takeIntoHand(list[i].kind);
  player.aimAngle = list[i].aimAngle;
  shine(list[i].x, list[i].y);
  list.splice(i, 1);
};

// Puts down the light in hand, where you stand, and takes out the pocketed one. Never on a plate (or
// every puzzle would be "put it on the plate"), a mirror or a lever.
const dropLight = () => {
  if (!lightState.held.value) return;
  if (level.doors.some(d => d.kind !== 'lever' && sameCell(d.trigger, player))) return;
  if (level.mirrors.some(m => sameCell(m, player)) || level.levers.some(l => sameCell(l, player))) return;
  lightState.dropped.push({
    kind: lightState.held.value,
    gridX: player.gridX,
    gridY: player.gridY,
    x: player.x,
    y: player.y,
    aimAngle: player.aimAngle,
  });
  lightState.held.value = takeFromPocket();
  shine(player.x, player.y);
};

// Whether a cell's centre is within `reach`, with no wall or door in between.
const withinReach = (cell: GridPos, reach: number) => {
  const c = cellCenter(cell);
  if (Math.hypot(c.x - player.x, c.y - player.y) > reach) return false;
  const between = (t: number) => ({ x: player.x + (c.x - player.x) * t, y: player.y + (c.y - player.y) * t });
  if ([0.25, 0.5, 0.75].some(t => insideWalls(between(t), level.walls))) return false;
  return !allDoorLeaves().some(s => segmentsCross(s, { x1: player.x, y1: player.y, x2: c.x, y2: c.y }));
};

// The turnable mirror within reach nearest to straight ahead, if any.
const facedMirror = () => {
  let best: MirrorState | null = null;
  let bestOff = (MIRROR.reachFacingDeg * Math.PI) / 180;
  for (const m of level.mirrors) {
    if (m.control !== 'turnable' || !withinReach(m, MIRROR.reach)) continue;
    const c = cellCenter(m);
    const off = Math.abs(wrapAngle(Math.atan2(c.y - player.y, c.x - player.x) - player.aimAngle));
    if (off <= bestOff) {
      best = m;
      bestOff = off;
    }
  }
  return best;
};

// Toggles a lever (and so its door), turning its mirrors a step.
const pullLever = (lever: LeverState) => {
  lever.on = !lever.on;
  lever.pulled = true;
  lever.pulledAt = performance.now();
  for (const m of level.mirrors) if (m.control === lever.id) turnMirror(m);
};

// F: swap the light in hand for the pocketed one (or take it out, hand empty).
export const swapHeldLight = () => {
  if (gameState.status.value !== 'playing' || lightState.stowed.value.length === 0) return;
  takeIntoHand(takeFromPocket()!);
};

// Space does the first of: pull a lever here; turn a turnable mirror here; pick up a light here; turn
// a turnable mirror you're facing (so Space at one never drops your light); drop your light.
export const act = () => {
  if (gameState.status.value !== 'playing') return;
  const lever = level.levers.find(l => sameCell(l, player));
  if (lever) return pullLever(lever);
  const mirrorHere = level.mirrors.find(m => m.control === 'turnable' && sameCell(m, player));
  if (mirrorHere) return turnMirror(mirrorHere);
  const light = lightInReach();
  if (light) {
    if (!light.blocked) pickUpLight(light);
    return;
  }
  const faced = facedMirror();
  if (faced) turnMirror(faced);
  else dropLight();
};

// A tap at world point `p`: on yourself, pick up or drop; on a lever or turnable mirror within
// INPUT.tapReach, pull or turn it.
export const tapAt = (p: Point) => {
  if (gameState.status.value !== 'playing') return;
  if (Math.hypot(p.x - player.x, p.y - player.y) <= INPUT.tapPlayerRadius) {
    const light = lightInReach();
    if (!light) dropLight();
    else if (!light.blocked) pickUpLight(light);
    return;
  }
  const cell = cellAt(p);
  const lever = level.levers.find(l => sameCell(l, cell));
  if (lever) {
    if (withinReach(lever, INPUT.tapReach)) pullLever(lever);
    return;
  }
  const mirror = level.mirrors.find(m => m.control === 'turnable' && sameCell(m, cell));
  if (mirror && withinReach(mirror, INPUT.tapReach)) turnMirror(mirror);
};
