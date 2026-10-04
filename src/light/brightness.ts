import type { Point } from '../core/types';
import { LIGHT, PLAYER } from '../core/consts';
import { wrapAngle } from '../core/util';
import type { LightGroup } from './rayTracer';

// How bright the traced light is at a point: what plates, the fear rule and the editor measure, with
// the same falloff the renderer draws.

// A fade's strength at `t` (0 at its axis, 1 at its edge): full within `core`, then smoothstep to nothing.
export const fadeProfile = (t: number, core: number) => {
  if (t >= 1) return 0;
  if (t <= core) return 1;
  const u = (t - core) / (1 - core);
  return 1 - u * u * (3 - 2 * u);
};

// How much of group `g`'s light its fades let reach `p` (1 if it has none).
export const fadeAt = (p: Point, g: LightGroup) => {
  let k = 1;
  for (const f of g.fades ?? []) {
    k *= fadeProfile(Math.abs(wrapAngle(Math.atan2(p.y - g.origin.y, p.x - g.origin.x) - f.axis)) / f.half, f.core);
  }
  return k;
};

// Brightness at `t` = distance / radius, from LIGHT.falloffStops.
const falloffAt = (t: number) => {
  for (let i = 1; i < LIGHT.falloffStops.length; i++) {
    const [t1, v1] = LIGHT.falloffStops[i];
    if (t <= t1) {
      const [t0, v0] = LIGHT.falloffStops[i - 1];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return 0;
};

// Even-odd ray-crossing test.
const insidePolygon = (p: Point, poly: Point[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
};

export const insideAny = (p: Point, polys: Point[][]) => polys.some(poly => insidePolygon(p, poly));

// Total brightness at `p` from every group reaching it (light adds).
export const brightnessAt = (p: Point, groups: LightGroup[]) => {
  let total = 0;
  for (const g of groups) {
    if (!insideAny(p, g.polys)) continue;
    const distance = Math.hypot(p.x - g.origin.x, p.y - g.origin.y);
    total += falloffAt(distance / g.radius) * fadeAt(p, g) * (g.strength ?? 1);
  }
  return total;
};

// The fear rule: empty-handed, you can walk to `p` only if a point within PLAYER.fearReach of it is
// lit to LIGHT.litThreshold.
const FEAR_PROBES = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const fearLit = (p: Point, groups: LightGroup[]) =>
  FEAR_PROBES.some(
    ([dx, dy]) =>
      brightnessAt({ x: p.x + dx * PLAYER.fearReach, y: p.y + dy * PLAYER.fearReach }, groups) >= LIGHT.litThreshold,
  );
