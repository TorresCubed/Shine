import { castLight, castFlashlight, brightnessAt, fearLit } from '../light/rayTracer';
import type { LightGroup } from '../light/rayTracer';
import { getScene } from '../light/scene';
import { cellCenter, doorLeaves, lampSource } from '../core/util';
import { startingMirror } from '../core/state';
import type { Level, LightKind, Point } from '../core/types';
import { GRID_SIZE, LIGHT, FLAME, FLASHLIGHT } from '../core/consts';

// A level's light as the game would trace it: its lamps and candles, plus any lights put down to try
// things. Light and locked doors open while their plate is lit (lever doors stay shut), and since an
// open door can light another plate, it's traced again until nothing changes.

export type TryLight = { kind: LightKind; x: number; y: number; aim: number }; // aim in degrees

export type Traced = {
  groups: LightGroup[];
  open: boolean[]; // per level.doors
  plates: number[]; // brightness at each door's trigger (0 for levers)
  at: (p: Point) => number;
  fearLit: (x: number, y: number) => boolean; // could you stand here empty-handed (cell centre)
};

export const traceLevel = (level: Level, lights: TryLight[], steps: Record<string, number> = {}): Traced => {
  const mirrors = level.mirrors.map(m => startingMirror(m, steps[`${m.gridX},${m.gridY}`]));
  let open = level.doors.map(() => false);
  let groups: LightGroup[] = [];
  let plates: number[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const scene = getScene(
      level.walls,
      mirrors,
      level.doors.flatMap((d, i) => doorLeaves(d, open[i] ? 1 : 0)),
    );
    groups = [];
    const omni = (at: Point, radius: number) =>
      groups.push(...castLight(at, 0, Math.PI * 2, FLAME.rayCount, radius, scene, LIGHT.maxMirrorBounces, true).groups);
    for (const l of level.lamps) omni(lampSource(l), FLAME.lampRadius);
    for (const d of level.startDropped) omni(d, FLAME.candleRadius);
    for (const l of lights) {
      const c = cellCenter({ gridX: l.x, gridY: l.y });
      if (l.kind === 'candle') {
        omni(c, FLAME.candleRadius);
        continue;
      }
      const aim = (l.aim * Math.PI) / 180;
      const back = FLASHLIGHT.back * GRID_SIZE;
      const from = { x: c.x - Math.cos(aim) * back, y: c.y - Math.sin(aim) * back };
      groups.push(...castFlashlight(from, aim, FLASHLIGHT.range, scene).groups);
    }
    plates = level.doors.map(d => (d.kind === 'lever' ? 0 : brightnessAt(cellCenter(d.trigger), groups)));
    const next = level.doors.map((d, i) => d.kind !== 'lever' && plates[i] >= LIGHT.litThreshold);
    if (next.every((o, i) => o === open[i])) break;
    open = next;
  }
  const at = (p: Point) => brightnessAt(p, groups);
  // A dropped light's cell always counts.
  const walkable = (x: number, y: number) =>
    lights.some(l => l.x === x && l.y === y) || fearLit(cellCenter({ gridX: x, gridY: y }), groups);
  return { groups, open, plates, at, fearLit: walkable };
};
