import { PLAYER, MIRROR, DOOR } from '../core/consts';
import { level } from '../core/state';
import type { GridPos, Point } from '../core/types';
import { cellCenter, doorLeaves, footprintCells, insideWalls, segmentNearSquare } from '../core/util';

// What blocks the player's footprint.

export const isWalkable = (c: GridPos) => !insideWalls(cellCenter(c), level.walls);

// A mirror blocks only at its pivot, so you can walk round its ends to reach it.
export const hitsMirror = (p: Point) =>
  level.mirrors.some(m => {
    const c = cellCenter(m);
    const dx = Math.max(0, Math.abs(p.x - c.x) - PLAYER.collisionRadius);
    const dy = Math.max(0, Math.abs(p.y - c.y) - PLAYER.collisionRadius);
    return Math.hypot(dx, dy) < MIRROR.pivotRadius;
  });

// The door you'd bump at `p`: its leaves, plus its whole closed edge until fully open (slipping through
// mid-swing would let you light a plate, walk off, and skip the puzzle).
export const doorAt = (p: Point) =>
  level.doors.find(d =>
    [...doorLeaves(d, d.openAmount), ...(d.openAmount < 1 ? doorLeaves(d, 0) : [])].some(s =>
      segmentNearSquare(s, p, PLAYER.collisionRadius, DOOR.thickness / 2),
    ),
  );

export const footprintClear = (p: Point) => footprintCells(p.x, p.y).every(isWalkable) && !hitsMirror(p) && !doorAt(p);
