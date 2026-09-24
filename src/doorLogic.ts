import type { LightGroup } from "./rayTracer";
import type { Point } from "./interfaces";
import { brightnessAt, insideAny } from "./rayTracer";
import { doors, player, setDoorOpenAmount, footprintCells, GRID_SIZE, LIT_THRESHOLD, DOOR_OPEN_MS } from "./consts";

// The player can see the door and it's lit: at its cell centre (once open) or just outside either
// face. `view` is what the player has line of sight to.
const isSeen = (door: typeof doors[0], groups: LightGroup[], view: Point[][]) => {
  const out = GRID_SIZE / 2 + 1;
  return door.cells.some(c => {
    const cx = (c.gridX + 0.5) * GRID_SIZE, cy = (c.gridY + 0.5) * GRID_SIZE;
    const probes = door.slide === 'x'
      ? [{ x: cx, y: cy }, { x: cx, y: cy - out }, { x: cx, y: cy + out }]
      : [{ x: cx, y: cy }, { x: cx - out, y: cy }, { x: cx + out, y: cy }];
    return probes.some(p => insideAny(p, view) && brightnessAt(p, groups) > 0);
  });
}

// Walking into a locked door while its plate is lit (i.e. it's unlocked) opens it for good.
export const tryOpenLockedDoor = (gx: number, gy: number) => {
  for (const door of doors) {
    if (door.kind !== 'locked' || !door.plateLit) continue;
    if (door.cells.some(c => c.gridX === gx && c.gridY === gy)) door.opened = true;
  }
}

// A light door slides open while its plate is lit, slides shut otherwise, and won't close on the
// player standing in it. A locked door slides open once opened, and stays open. `dt` in seconds.
export const updateDoors = (groups: LightGroup[], view: Point[][], dt: number) => {
  const step = dt * 1000 / DOOR_OPEN_MS;
  for (const door of doors) {
    const plate = { x: (door.plate.gridX + 0.5) * GRID_SIZE, y: (door.plate.gridY + 0.5) * GRID_SIZE };
    door.plateLit = brightnessAt(plate, groups) >= LIT_THRESHOLD;
    // Any part of the player in the doorway holds it open, not just their centre.
    const inDoorway = footprintCells(player.x, player.y);
    const occupied = door.cells.some(c => inDoorway.some(p => p.gridX === c.gridX && p.gridY === c.gridY));
    const target = door.kind === 'locked'
      ? (door.opened ? 1 : 0)
      : (door.plateLit || occupied ? 1 : 0);
    const amount = target > door.openAmount
      ? Math.min(target, door.openAmount + step)
      : Math.max(target, door.openAmount - step);
    setDoorOpenAmount(door, amount);
    if (isSeen(door, groups, view)) door.seenOpenAmount = door.openAmount;
  }
}
