import { fromMap } from '../content/levelFormat';
import { GRID_SIZE, LIGHT } from '../core/consts';
import type { Level } from '../core/types';
import { toSource } from './levelCode';
import type { Aim } from './levelCode';
import { ed } from './model';
import type { Traced, TryLight } from './preview';

// The level as the game would build it, and what to trace for the preview.

export const buildLevel = (): { level: Level | null; error: string } => {
  try {
    const { map, options } = toSource(ed.doc);
    return { level: fromMap('This level', map, options), error: '' };
  } catch (e) {
    return { level: null, error: (e as Error).message };
  }
};

const AIM_DEGREES: Record<Aim, number> = { right: 0, down: 90, left: 180, up: 270 };

export const lightsToTrace = (level: Level): TryLight[] => {
  const lights = [...ed.tries];
  if (ed.showHeld && level.startHeld) {
    lights.push({ kind: level.startHeld, x: level.start.gridX, y: level.start.gridY, aim: AIM_DEGREES[ed.doc.aim] });
  }
  return lights;
};

// The 15% line: brightness sampled 4 times per cell, with an edge wherever a lit sample meets an unlit one.
export const traceFearLine = (t: Traced) => {
  const n = 4;
  const cols = ed.doc.grid[0].length * n;
  const rows = ed.doc.grid.length * n;
  const s = 1 / n;
  const lit: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    lit.push([]);
    for (let i = 0; i < cols; i++)
      lit[j].push(t.at({ x: (i + 0.5) * s * GRID_SIZE, y: (j + 0.5) * s * GRID_SIZE }) >= LIGHT.litThreshold);
  }
  const segs: [number, number, number, number][] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (i + 1 < cols && lit[j][i] !== lit[j][i + 1]) segs.push([(i + 1) * s, j * s, (i + 1) * s, (j + 1) * s]);
      if (j + 1 < rows && lit[j][i] !== lit[j + 1][i]) segs.push([i * s, (j + 1) * s, (i + 1) * s, (j + 1) * s]);
    }
  return segs;
};
