import type { LightGroup } from "../light/rayTracer";
import type { Point } from "../core/types";
import { brightnessAt, insideAny } from "../light/rayTracer";
import { LIGHT, DOOR, PLATE } from "../core/consts";
import { doors, levers, player, footprintCells, doorLeaves } from "../core/state";
import type { DoorState } from "../core/state";
import { cellCenter, sameCell } from "../core/util";

// The player sees the door if it's lit and in line of sight: just off either face of an edge it
// closes, or halfway along a leaf where it is now.
const isSeen = (door: DoorState, groups: LightGroup[], view: Point[][]) => {
  const closed = doorLeaves(door, 0), now = doorLeaves(door, door.openAmount);
  return closed.some((s, i) => {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2, len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const nx = -(s.y2 - s.y1) / len * 4, ny = (s.x2 - s.x1) / len * 4;
    const leaf = now[i];
    const probes = [{ x: mx + nx, y: my + ny }, { x: mx - nx, y: my - ny }, { x: (leaf.x1 + leaf.x2) / 2, y: (leaf.y1 + leaf.y2) / 2 }];
    return probes.some(p => insideAny(p, view) && brightnessAt(p, groups) > 0);
  });
}

// Walking into a locked door while its plate is lit opens it for good.
export const tryOpenLockedDoor = (door: DoorState) => {
  if (door.kind === 'locked' && door.triggerOn) door.opened = true;
}

// The openAmount that swings a leaf DOOR.creak of the way (the swing is eased: see doorLeaves).
const CREAK_AMOUNT = DOOR.creak <= 0.5 ? Math.cbrt(DOOR.creak / 4) : 1 - Math.cbrt((1 - DOOR.creak) / 4);

// Light doors follow their plate, lever doors their lever, and locked doors stay open once opened.
// A door never swings into you: while you're in a cell a leaf swings through, it stays where it is,
// so it won't close on you or open into you. `dt` in seconds.
export const updateDoors = (groups: LightGroup[], view: Point[][], dt: number) => {
  const step = dt * 1000 / DOOR.openMs;
  const underPlayer = footprintCells(player.x, player.y);
  for (const door of doors) {
    door.triggerOn = door.kind === 'lever'
      ? levers.some(l => l.on && sameCell(l, door.trigger))
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
    const target = ajar ? (door.triggerOn ? CREAK_AMOUNT : 0) : (door.triggerOn || door.opened ? 1 : 0);
    const before = door.openAmount;
    if (!inTheWay) {
      door.openAmount = target > door.openAmount
        ? Math.min(target, door.openAmount + (ajar ? dt * 1000 * CREAK_AMOUNT / DOOR.creakMs : step))
        : Math.max(target, door.openAmount - (ajar ? dt * 1000 * CREAK_AMOUNT / DOOR.slamMs : step));
    }
    let active = door.openAmount !== before;
    // A locked door flashes when it unlocks or locks again (not for how it starts).
    if (door.kind === 'locked') {
      const unlocked = door.triggerOn || door.opened;
      if (door.wasUnlocked !== null && unlocked !== door.wasUnlocked) { door.lockFlashAt = performance.now(); active = true; }
      door.wasUnlocked = unlocked;
    }
    // Seen now, or seen before and doing something (swinging, locking, unlocking): shown as it is.
    const seen = isSeen(door, groups, view);
    if (seen) door.everSeen = true;
    door.showWhole = seen || (door.everSeen && active);
    if (door.showWhole) door.seenOpenAmount = door.openAmount;
  }
}
