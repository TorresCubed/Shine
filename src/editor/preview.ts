import { castLight, castFlashlight, brightnessAt } from "../rayTracer";
import type { LightGroup } from "../rayTracer";
import { getScene } from "../scene";
import { cellCenter } from "../util";
import { doorLeaves } from "../state";
import type { MirrorState } from "../state";
import type { Level, LightKind, Point } from "../interfaces";
import {
  GRID_SIZE, CANDLE_RADIUS, LAMP_RADIUS, FLASHLIGHT_RANGE,
  CANDLE_RAY_COUNT, MAX_MIRROR_BOUNCES, LIT_THRESHOLD, FEAR_REACH, FLASHLIGHT_BACK, LIGHT_EDGE_GAP,
} from "../consts";

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
    const omni = (at: Point, radius: number) => groups.push(...castLight(at, 0, Math.PI * 2, CANDLE_RAY_COUNT, radius, scene, MAX_MIRROR_BOUNCES, true).groups);
    for (const l of level.lamps) {
      const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT_EDGE_GAP;
      omni({ x: c.x + l.toWallX * out, y: c.y + l.toWallY * out }, LAMP_RADIUS);
    }
    for (const d of level.startDropped) omni(d, CANDLE_RADIUS);
    for (const l of lights) {
      const c = cellCenter({ gridX: l.x, gridY: l.y });
      if (l.kind === 'candle') { omni(c, CANDLE_RADIUS); continue; }
      const aim = l.aim * Math.PI / 180, back = FLASHLIGHT_BACK * GRID_SIZE;
      const from = { x: c.x - Math.cos(aim) * back, y: c.y - Math.sin(aim) * back };
      groups.push(...castFlashlight(from, aim, FLASHLIGHT_RANGE, scene).groups);
    }
    plates = level.doors.map(d => d.kind === 'lever' ? 0 : brightnessAt(cellCenter(d.trigger), groups));
    const next = level.doors.map((d, i) => d.kind !== 'lever' && plates[i] >= LIT_THRESHOLD);
    if (next.every((o, i) => o === open[i])) break;
    open = next;
  }
  const at = (p: Point) => brightnessAt(p, groups);
  const fearLit = (x: number, y: number) => {
    if (lights.some(l => l.x === x && l.y === y)) return true; // a dropped light's cell always counts
    const c = cellCenter({ gridX: x, gridY: y });
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      at({ x: c.x + dx * FEAR_REACH, y: c.y + dy * FEAR_REACH }) >= LIT_THRESHOLD);
  };
  return { groups, open, plates, at, fearLit };
}
