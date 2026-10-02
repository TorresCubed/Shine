import type { Level } from "../core/types";
import { GRID_SIZE } from "../core/consts";
import { fearLit } from "../light/rayTracer";
import { cellCenter, insideWalls } from "../core/util";
import { traceLevel } from "./preview";

// Every way to win a flashlight-only level: each setting of the movable mirrors, drop cell and aim,
// then a walk to the exit through cells the fear rule allows. Cell by cell, so it's a close guide, not
// an exact replay (it doesn't know mirror pivots block you).

export type Solution = { steps: Record<string, number>; x: number; y: number; aims: number[] };

const AIM_STEP = 10;

// Why the solver can't judge this level, or null if it can.
export const solverLimits = (level: Level) => {
  const lights = [level.startHeld, ...level.startStowed, ...level.pickups.map(p => p.kind)];
  if (lights.includes('candle') || level.startDropped.length) return 'The solver only handles flashlight-only levels: with a candle too, the fear rule barely applies.';
  if (!lights.includes('flashlight')) return 'There is no flashlight in this level.';
  if (level.doors.some(d => d.kind === 'lever')) return 'The solver can\'t pull levers, so it can\'t judge lever doors.';
  return null;
}

export const solve = async (level: Level, onProgress: (done: number, total: number) => void, cancelled: () => boolean) => {
  const wallAt = (x: number, y: number) => insideWalls(cellCenter({ gridX: x, gridY: y }), level.walls);
  // The door, if any, on the edge between two neighbouring cells.
  const doorBetween = (ax: number, ay: number, bx: number, by: number) => level.doors.findIndex(d => d.leaves.some(l =>
    (l.into.gridX === ax && l.into.gridY === ay && l.from.gridX === bx && l.from.gridY === by) ||
    (l.into.gridX === bx && l.into.gridY === by && l.from.gridX === ax && l.from.gridY === ay)));
  const isPlate = (x: number, y: number) => level.doors.some(d => d.kind !== 'lever' && d.trigger.gridX === x && d.trigger.gridY === y);
  const isMirror = (x: number, y: number) => level.mirrors.some(m => m.gridX === x && m.gridY === y);
  const isLever = (x: number, y: number) => level.levers.some(l => l.gridX === x && l.gridY === y);

  const drops: [number, number][] = [];
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
    if (!wallAt(x, y) && !isPlate(x, y) && !isMirror(x, y) && !isLever(x, y) && !(x === level.goal.gridX && y === level.goal.gridY)) drops.push([x, y]);
  }
  const movable = level.mirrors.filter(m => m.control !== 'fixed').map(m => `${m.gridX},${m.gridY}`);
  const combos = movable.reduce<Record<string, number>[]>((acc, k) => acc.flatMap(a => [0, 1, 2, 3, 4, 5, 6, 7].map(s => ({ ...a, [k]: s }))), [{}]);

  const found = new Map<string, Solution>();
  const total = combos.length * drops.length;
  let done = 0;
  for (const steps of combos) for (const [x, y] of drops) {
    if (cancelled()) return [...found.values()];
    if (++done % 20 === 0) { onProgress(done, total); await new Promise(r => setTimeout(r)); }
    for (let aim = 0; aim < 360; aim += AIM_STEP) {
      const t = traceLevel(level, [{ kind: 'flashlight', x, y, aim }], steps);
      if (!t.open.some(o => o)) continue;
      // Walk out: 8-way steps, not through a shut door, and a diagonal only past two open side cells
      // (with no shut door on its way round) and through a lit corner.
      const shut = (ax: number, ay: number, bx: number, by: number) => { const d = doorBetween(ax, ay, bx, by); return d >= 0 && !t.open[d]; };
      const seen = new Set([`${x},${y}`]);
      const queue = [[x, y]];
      let won = false;
      while (queue.length && !won) {
        const [cx, cy] = queue.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height || seen.has(`${nx},${ny}`) || wallAt(nx, ny)) continue;
          if (!dx || !dy ? shut(cx, cy, nx, ny) : shut(cx, cy, nx, cy) || shut(cx, cy, cx, ny) || shut(nx, cy, nx, ny) || shut(cx, ny, nx, ny)) continue;
          if (!t.fearLit(nx, ny)) continue;
          if (dx && dy) {
            if (wallAt(nx, cy) || wallAt(cx, ny)) continue;
            if (!fearLit({ x: (cx + 0.5 + dx / 2) * GRID_SIZE, y: (cy + 0.5 + dy / 2) * GRID_SIZE }, t.groups)) continue;
          }
          if (nx === level.goal.gridX && ny === level.goal.gridY) { won = true; break; }
          seen.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
      if (!won) continue;
      const key = `${JSON.stringify(steps)}|${x},${y}`;
      if (!found.has(key)) found.set(key, { steps, x, y, aims: [] });
      found.get(key)!.aims.push(aim);
    }
  }
  onProgress(total, total);
  return [...found.values()];
}
