import type { LightGroup } from "./rayTracer";
import type { Point } from "./interfaces";
import { brightnessAt, insideAny } from "./rayTracer";
import { GRID_SIZE, LIT_THRESHOLD, DOOR_OPEN_MS } from "./consts";
import { doors, levers, player, setDoorOpenAmount, footprintCells } from "./state";
import type { DoorState } from "./state";
import { cellCenter, sameCell } from "./util";

// The player sees the door if it's lit and in line of sight: at its cell centre (once open) or
// just outside either face.
const isSeen = (door: DoorState, groups: LightGroup[], view: Point[][]) => {
  const out = GRID_SIZE / 2 + 1;
  return door.cells.some(c => {
    const { x, y } = cellCenter(c);
    const probes = door.slide === 'x'
      ? [{ x, y }, { x, y: y - out }, { x, y: y + out }]
      : [{ x, y }, { x: x - out, y }, { x: x + out, y }];
    return probes.some(p => insideAny(p, view) && brightnessAt(p, groups) > 0);
  });
}

// Walking into a locked door while its plate is lit opens it for good.
export const tryOpenLockedDoor = (gx: number, gy: number) => {
  for (const door of doors) {
    if (door.kind === 'locked' && door.triggerOn && door.cells.some(c => c.gridX === gx && c.gridY === gy)) door.opened = true;
  }
}

// Light doors follow their plate and won't close on the player standing in them; lever doors
// follow their lever; locked doors stay open once opened. `dt` in seconds.
export const updateDoors = (groups: LightGroup[], view: Point[][], dt: number) => {
  const step = dt * 1000 / DOOR_OPEN_MS;
  const underPlayer = footprintCells(player.x, player.y);
  for (const door of doors) {
    door.triggerOn = door.kind === 'lever'
      ? levers.some(l => l.on && sameCell(l, door.trigger))
      : brightnessAt(cellCenter(door.trigger), groups) >= LIT_THRESHOLD;
    const occupied = door.cells.some(c => underPlayer.some(p => sameCell(p, c)));
    const target = door.kind === 'locked' ? (door.opened ? 1 : 0) : (door.triggerOn || occupied ? 1 : 0);
    const amount = target > door.openAmount
      ? Math.min(target, door.openAmount + step)
      : Math.max(target, door.openAmount - step);
    setDoorOpenAmount(door, amount);
    if (isSeen(door, groups, view)) door.seenOpenAmount = door.openAmount;
  }
}
