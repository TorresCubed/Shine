import type { LightGroup } from '../light/rayTracer';
import type { DoorState, Point } from '../core/types';
import { brightnessAt, insideAny } from '../light/brightness';
import { LIGHT, DOOR, PLATE } from '../core/consts';
import { level, player } from '../core/state';
import { cellCenter, doorLeaves, footprintCells, normalOf, sameCell } from '../core/util';

// Seen if lit and in sight: just off either side of its closed edge, or mid-leaf where it is now.
const isSeen = (door: DoorState, groups: LightGroup[], view: Point[][]) => {
  const closed = doorLeaves(door, 0);
  const now = doorLeaves(door, door.openAmount);
  return closed.some((s, i) => {
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const n = normalOf(s, 4);
    const leaf = now[i];
    const probes = [
      { x: mx + n.x, y: my + n.y },
      { x: mx - n.x, y: my - n.y },
      { x: (leaf.x1 + leaf.x2) / 2, y: (leaf.y1 + leaf.y2) / 2 },
    ];
    return probes.some(p => insideAny(p, view) && brightnessAt(p, groups) > 0);
  });
};

// Walking into a locked door while its plate is lit opens it for good.
export const tryOpenLockedDoor = (door: DoorState) => {
  if (door.kind === 'locked' && door.triggerOn) door.opened = true;
};

// The openAmount that swings a leaf DOOR.creak of the way (the swing is eased).
const CREAK_AMOUNT = DOOR.creak <= 0.5 ? Math.cbrt(DOOR.creak / 4) : 1 - Math.cbrt((1 - DOOR.creak) / 4);

// Light doors follow their plate, lever doors their lever; locked doors stay open once opened. A door
// holds still while you're in a cell it swings through, so it never swings into you.
export const updateDoors = (groups: LightGroup[], view: Point[][], dt: number) => {
  const step = (dt * 1000) / DOOR.openMs;
  const underPlayer = footprintCells(player.x, player.y);
  for (const door of level.doors) {
    door.triggerOn =
      door.kind === 'lever'
        ? level.levers.some(l => l.on && sameCell(l, door.trigger))
        : brightnessAt(cellCenter(door.trigger), groups) >= LIGHT.litThreshold;
    if (door.triggerOn) {
      door.plateWake = Math.min(PLATE.wakeMs, door.plateWake + dt * 1000);
      door.winkAt = -Infinity;
    } else if (door.plateWake > 0) {
      door.winkAt = performance.now();
      door.winkFrom = door.plateWake / PLATE.wakeMs;
      door.plateWake = 0;
    }
    const inTheWay = door.leaves.some(l => underPlayer.some(c => sameCell(c, l.into)));
    // An unlocked door stands ajar till you open it; locked again, it slams.
    const ajar = door.kind === 'locked' && !door.opened;
    const target = ajar ? (door.triggerOn ? CREAK_AMOUNT : 0) : door.triggerOn || door.opened ? 1 : 0;
    const before = door.openAmount;
    if (!inTheWay) {
      door.openAmount =
        target > door.openAmount
          ? Math.min(target, door.openAmount + (ajar ? (dt * 1000 * CREAK_AMOUNT) / DOOR.creakMs : step))
          : Math.max(target, door.openAmount - (ajar ? (dt * 1000 * CREAK_AMOUNT) / DOOR.slamMs : step));
    }
    let active = door.openAmount !== before;
    // A locked door flashes when it unlocks or locks again (not for how it starts).
    if (door.kind === 'locked') {
      const unlocked = door.triggerOn || door.opened;
      if (door.wasUnlocked !== null && unlocked !== door.wasUnlocked) {
        door.lockFlashAt = performance.now();
        active = true;
      }
      door.wasUnlocked = unlocked;
    }
    // Seen now, or seen before and doing something: shown as it is.
    const seen = isSeen(door, groups, view);
    if (seen) door.everSeen = true;
    door.showWhole = seen || (door.everSeen && active);
    if (door.showWhole) door.seenOpenAmount = door.openAmount;
  }
};
