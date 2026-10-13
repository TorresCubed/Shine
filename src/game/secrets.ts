import type { LightGroup } from '../light/rayTracer';
import type { GridPos, Point, SecretWallState } from '../core/types';
import { brightnessAt, groupBrightnessAt, insideAny } from '../light/brightness';
import { GRID_SIZE, SECRET } from '../core/consts';
import { level, player, gameState, shine } from '../core/state';
import { cellCenter, footprintCells, insideWalls, sameCell } from '../core/util';
import { STEP } from '../content/levelFormat';

// Secret walls: while SECRET.lights lights reach a secret wall, it fades to a ghost you can walk
// through, and turns solid again when they don't (never on you). Each reflection counts as a light of
// its own, so a beam crossing its own reflection is two. One light alone only shimmers it.

const PROBE_OUT = 4; // px off the face
const PROBE_ALONG = [0.25, 0.5, 0.75];

// Points just off each of its faces that face floor: the same whether it's solid (the light stops at the
// face) or a ghost (the light passes through).
const probes = (s: SecretWallState): Point[] => {
  const c = cellCenter(s);
  const half = GRID_SIZE / 2;
  const points: Point[] = [];
  for (const [dx, dy] of Object.values(STEP)) {
    const next = cellCenter({ gridX: s.gridX + dx, gridY: s.gridY + dy });
    if (insideWalls(next, level.allWalls)) continue;
    for (const t of PROBE_ALONG) {
      const along = (t - 0.5) * GRID_SIZE;
      points.push({
        x: c.x + dx * (half + PROBE_OUT) + dy * along,
        y: c.y + dy * (half + PROBE_OUT) + dx * along,
      });
    }
  }
  return points;
};

// How many lights reach any of `points` to SECRET.threshold. A light and each reflection of it has its
// own (virtual) origin; spill past a mirror's edge isn't a light.
const lightsReaching = (points: Point[], groups: LightGroup[]) => {
  const lights = new Set<string>();
  for (const g of groups) {
    if (g.spill) continue;
    const key = `${g.source}:${Math.round(g.origin.x)},${Math.round(g.origin.y)}`;
    if (lights.has(key)) continue;
    if (points.some(p => groupBrightnessAt(p, g) >= SECRET.threshold)) lights.add(key);
  }
  return lights.size;
};

export const updateSecrets = (groups: LightGroup[], view: Point[][], dt: number) => {
  const under = footprintCells(player.x, player.y);
  let changed = false;
  for (const s of level.secretWalls) {
    const points = probes(s);
    const lights = lightsReaching(points, groups);
    const inside = under.some(c => sameCell(c, s));
    const solid = lights < SECRET.lights && !inside;
    if (solid !== s.solid) {
      s.solid = solid;
      changed = true;
    }
    const target = !solid ? 1 : lights > 0 ? SECRET.shimmer : 0;
    const step = (dt * 1000) / SECRET.fadeMs;
    s.shown = target > s.shown ? Math.min(target, s.shown + step) : Math.max(target, s.shown - step);
    if (inside || points.some(p => insideAny(p, view) && brightnessAt(p, groups) > 0)) s.seenShown = s.shown;
  }
  // A new array, so what's cached on the walls is rebuilt.
  if (changed) level.walls = level.allWalls.filter(w => !level.secretWalls.some(s => !s.solid && s.wall === w));

  if (level.trinket && sameCell(player, level.trinket)) {
    const at = cellCenter(level.trinket);
    shine(at.x, at.y);
    level.trinket = null;
    gameState.trinketTaken = true;
  }
};

// Whether `c` is a secret wall's cell (nothing can be put down in one).
export const isSecretCell = (c: GridPos) => level.secretWalls.some(s => sameCell(s, c));
