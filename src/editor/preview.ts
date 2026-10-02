import { castLight, castFlashlight, brightnessAt } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import { getScene } from "../light/scene";
import { cellCenter } from "../core/util";
import { doorLeaves } from "../core/state";
import type { MirrorState } from "../core/state";
import type { Level, LightKind, Point } from "../core/types";
import { GRID_SIZE, PLAYER, LIGHT, FLAME, FLASHLIGHT } from "../core/consts";

// A level's light as it would be in the game, with the real ray tracer: its lamps,
// candles standing on the floor, plus any lights put down to try things (a flashlight shining from
// its handle end, as a dropped one does). Light doors open while their plate is lit, and so do locked
// doors (they can be unlocked then); lever doors stay shut. Opening a door can let light through to
// another plate, so it's traced again until nothing changes.

export type TryLight = { kind: LightKind; x: number; y: number; aim: number }; // aim in degrees

export type Traced = {
  groups: LightGroup[];
  open: boolean[];   // per level.doors
  plates: number[];  // brightness at each door's trigger (0 for levers)
  at: (p: Point) => number;
  fearLit: (x: number, y: number) => boolean; // could you stand here empty-handed (cell centre)
};

export const traceLevel = (level: Level, lights: TryLight[], steps: Record<string, number> = {}): Traced => {
  const mirrors = level.mirrors.map(m => {
    const s = steps[`${m.gridX},${m.gridY}`] ?? m.step;
    return { ...m, step: s, shownStep: s, turnLeft: 0, turnSpeed: 0, seenStep: s, everSeen: false } as MirrorState;
  });
  let open = level.doors.map(() => false);
  let groups: LightGroup[] = [];
  let plates: number[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const scene = getScene(level.walls, mirrors, level.doors.flatMap((d, i) => doorLeaves(d, open[i] ? 1 : 0)));
    groups = [];
    const omni = (at: Point, radius: number) => groups.push(...castLight(at, 0, Math.PI * 2, FLAME.rayCount, radius, scene, LIGHT.maxMirrorBounces, true).groups);
    for (const l of level.lamps) {
      const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT.edgeGap;
      omni({ x: c.x + l.toWallX * out, y: c.y + l.toWallY * out }, FLAME.lampRadius);
    }
    for (const d of level.startDropped) omni(d, FLAME.candleRadius);
    for (const l of lights) {
      const c = cellCenter({ gridX: l.x, gridY: l.y });
      if (l.kind === 'candle') { omni(c, FLAME.candleRadius); continue; }
      const aim = l.aim * Math.PI / 180, back = FLASHLIGHT.back * GRID_SIZE;
      const from = { x: c.x - Math.cos(aim) * back, y: c.y - Math.sin(aim) * back };
      groups.push(...castFlashlight(from, aim, FLASHLIGHT.range, scene).groups);
    }
    plates = level.doors.map(d => d.kind === 'lever' ? 0 : brightnessAt(cellCenter(d.trigger), groups));
    const next = level.doors.map((d, i) => d.kind !== 'lever' && plates[i] >= LIGHT.litThreshold);
    if (next.every((o, i) => o === open[i])) break;
    open = next;
  }
  const at = (p: Point) => brightnessAt(p, groups);
  const fearLit = (x: number, y: number) => {
    if (lights.some(l => l.x === x && l.y === y)) return true; // a dropped light's cell always counts
    const c = cellCenter({ gridX: x, gridY: y });
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      at({ x: c.x + dx * PLAYER.fearReach, y: c.y + dy * PLAYER.fearReach }) >= LIGHT.litThreshold);
  };
  return { groups, open, plates, at, fearLit };
}
