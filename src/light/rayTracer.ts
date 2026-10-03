import type { Point, Scene } from '../core/types';
import { SCENE_STRIDE } from '../core/types';
import { LIGHT, FLASHLIGHT, RAYS, PLAYER } from '../core/consts';
import { wrapAngle } from '../core/util';

// Forward ray tracing. Rays leave the light, and each one bounces off mirrors (angle of incidence =
// angle of reflection) until it hits a wall, runs out of range, or runs out of bounces.
//
// For the lit area, adjacent rays are paired up into strips (quads between ray i and ray i+1),
// one strip per leg. Two neighbouring rays only share a leg-k strip if they bounced off the exact
// same chain of mirrors to get there, so a strip never bridges two different reflections.

const LEG_STRIDE = 6; // fromX, fromY, toX, toY, virtualX, virtualY
const HIT_EPSILON = 1e-6;

// One traced ray, in typed arrays pooled across frames, so tracing allocates nothing but the output polygons.
class RayPath {
  angle = 0;
  legCount = 0;
  legs: Float64Array;
  // Identifies the chain of mirrors a leg has bounced through: 0 = direct light, otherwise the
  // mirror indices packed base-(mirrorCount+1). Legs with equal keys share one virtual source.
  keys: Int32Array;
  hits: Int32Array; // segment index each leg ends on, or -1 if it ran out of range
  constructor(maxLegs: number) {
    this.legs = new Float64Array(maxLegs * LEG_STRIDE);
    this.keys = new Int32Array(maxLegs);
    this.hits = new Int32Array(maxLegs);
  }
}

// All the light that reached the floor through one particular chain of mirrors (or directly).
// `origin` is that chain's virtual source — the light's position mirrored through each mirror in
// turn. Distance from it to any point in `polys` equals the true path length the light travelled,
// so a radial falloff centred on it is physically correct at every bounce depth.
export interface LightGroup {
  depth: number; // 0 = direct light, 1 = one bounce, etc.
  origin: Point;
  radius: number; // the light's range, which its falloff runs across
  polys: Point[][];
  // A beam (cast over less than a full circle): its centre direction from `origin` (through mirrors
  // too) and half its width.
  beamAxis?: number;
  beamHalf?: number;
  // How it dims toward its sides: a beam toward its edges, light off a mirror toward the edges of
  // what the mirror catches. Each multiplies in (see fadeAt).
  fades?: Fade[];
  strength?: number; // how bright, 1 if unset (a flashlight's spill is dim)
  spill?: boolean; // spill (a flashlight's, or off a mirror's edges), not the light itself
  mirrorSeg?: number; // light off a mirror: the scene segment of the mirror it last came off
  flame?: number; // a flame's flicker seed, the same for all its reflections (set by the renderer)
  penumbras?: Penumbra[]; // its shadows' soft edges (see addPenumbras): drawn only
}

// A shadow's soft edge: a fan from just past the corner casting it, `ends[0]` along the shadow's
// edge and each next one further into the shadow, to `ends[RAYS.softShadowSteps]`.
export interface Penumbra {
  apex: Point;
  ends: Point[];
}

// A fade across a group, seen from its origin: full within `core` of `half` either side of `axis`,
// then easing smoothly (smoothstep) to nothing at `half`.
export interface Fade {
  axis: number;
  half: number;
  core: number;
}
export const fadeProfile = (t: number, core: number) => {
  if (t >= 1) return 0;
  if (t <= core) return 1;
  const u = (t - core) / (1 - core);
  return 1 - u * u * (3 - 2 * u);
};
// How much of group `g`'s light reaches `p` for its fades (1 if it has none).
export const fadeAt = (p: Point, g: LightGroup) => {
  let k = 1;
  for (const f of g.fades ?? []) {
    k *= fadeProfile(Math.abs(wrapAngle(Math.atan2(p.y - g.origin.y, p.x - g.origin.x) - f.axis)) / f.half, f.core);
  }
  return k;
};

interface LightResult {
  groups: LightGroup[]; // groups[0] is always the direct light
  rayCount: number;
}

let pool: RayPath[] = [];
let poolLegs = 0;
let poolUsed = 0;
const rays: RayPath[] = [];
let activeSegs = new Int32Array(64);
let activeCount = 0;

// Any point a ray reaches, bounces included, is within `budget` of the light (a bent path is never
// shorter than the straight line). So segments entirely outside that circle can't be hit by any ray
// this frame, bounced or not, and are dropped once up front rather than tested per ray.
const cullSegments = (scene: Scene, ox: number, oy: number, budget: number) => {
  if (activeSegs.length < scene.count) activeSegs = new Int32Array(scene.count);
  activeCount = 0;
  const c = scene.coords;
  const budgetSq = budget * budget;
  for (let s = 0; s < scene.count; s++) {
    const o = s * SCENE_STRIDE;
    const x1 = c[o];
    const y1 = c[o + 1];
    const ex = c[o + 2] - x1;
    const ey = c[o + 3] - y1;
    const lenSq = ex * ex + ey * ey;
    let t = lenSq === 0 ? 0 : ((ox - x1) * ex + (oy - y1) * ey) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * ex - ox;
    const py = y1 + t * ey - oy;
    if (px * px + py * py <= budgetSq) activeSegs[activeCount++] = s;
  }
};

const trace = (ray: RayPath, ox: number, oy: number, angle: number, budget: number, scene: Scene, maxLegs: number) => {
  const c = scene.coords;
  const keyBase = scene.mirrorCount + 1;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  let x = ox;
  let y = oy;
  let travelled = 0;
  let key = 0;
  let ignore = -1;

  ray.angle = angle;
  ray.legCount = 0;

  for (let leg = 0; leg < maxLegs; leg++) {
    let best = budget - travelled;
    let bestSeg = -1;

    for (let i = 0; i < activeCount; i++) {
      const s = activeSegs[i];
      if (s === ignore) continue; // a flat mirror can't be hit again straight after bouncing off it
      const o = s * SCENE_STRIDE;
      const ex = c[o + 2] - c[o];
      const ey = c[o + 3] - c[o + 1];
      const denom = dx * ey - dy * ex;
      if (denom > -1e-12 && denom < 1e-12) continue; // parallel
      const wx = c[o] - x;
      const wy = c[o + 1] - y;
      const t = (wx * ey - wy * ex) / denom; // distance along the ray (direction is unit length)
      if (t <= HIT_EPSILON || t >= best) continue;
      const u = (wx * dy - wy * dx) / denom; // position along the segment, 0..1
      if (u < 0 || u > 1) continue;
      best = t;
      bestSeg = s;
    }

    const hx = x + dx * best;
    const hy = y + dy * best;
    const l = leg * LEG_STRIDE;
    ray.legs[l] = x;
    ray.legs[l + 1] = y;
    ray.legs[l + 2] = hx;
    ray.legs[l + 3] = hy;
    ray.legs[l + 4] = x - dx * travelled;
    ray.legs[l + 5] = y - dy * travelled;
    ray.keys[leg] = key;
    ray.hits[leg] = bestSeg;
    ray.legCount++;

    travelled += best;
    if (bestSeg < 0) break; // ran out of range in open space
    const mirror = scene.mirrorIndex[bestSeg];
    if (mirror < 0) break; // wall absorbs it

    const o = bestSeg * SCENE_STRIDE;
    const nx = c[o + 4];
    const ny = c[o + 5];
    const dot = dx * nx + dy * ny;
    dx -= 2 * dot * nx;
    dy -= 2 * dot * ny;
    x = hx;
    y = hy;
    key = key * keyBase + mirror + 1;
    ignore = bestSeg;
  }
};

const nextRay = (maxLegs: number): RayPath | null => {
  if (poolUsed >= RAYS.maxTraced) return null;
  if (poolUsed === pool.length) pool.push(new RayPath(Math.max(maxLegs, poolLegs)));
  return pool[poolUsed++];
};

// Neighbouring rays that hit the same surfaces at every leg they share can be joined by a strip
// safely. If they don't, there's an edge somewhere between them worth resolving.
const sameHits = (a: RayPath, b: RayPath) => {
  const n = Math.min(a.legCount, b.legCount);
  for (let i = 0; i < n; i++) if (a.hits[i] !== b.hits[i]) return false;
  return true;
};

// Bisects between a and b while they disagree, appending new rays to `rays` in angular order.
const refine = (
  a: RayPath,
  b: RayPath,
  depth: number,
  ox: number,
  oy: number,
  budget: number,
  scene: Scene,
  maxLegs: number,
) => {
  if (depth <= 0 || sameHits(a, b)) return;
  const mid = nextRay(maxLegs);
  if (!mid) return;
  trace(mid, ox, oy, (a.angle + b.angle) / 2, budget, scene, maxLegs);
  refine(a, mid, depth - 1, ox, oy, budget, scene, maxLegs);
  rays.push(mid);
  refine(mid, b, depth - 1, ox, oy, budget, scene, maxLegs);
};

// Emits the strip polygon covering leg k of rays[first..last] into its light group. For a beam
// (`beam`: its centre direction and half-width), a new group gets the beam's axis as seen from its
// virtual source: each bounce mirrors the rays, so a ray at angle θ from the light leaves the
// virtual source at ±θ + c (flipped once per bounce), and one ray gives c.
const emitStrip = (
  groups: Map<number, LightGroup>,
  k: number,
  first: number,
  last: number,
  origin: Point,
  radius: number,
  beam: { axis: number; half: number } | null,
) => {
  const key = rays[first].keys[k];
  let group = groups.get(key);
  if (!group) {
    const l = k * LEG_STRIDE;
    const v = k === 0 ? origin : { x: rays[first].legs[l + 4], y: rays[first].legs[l + 5] };
    group = { depth: k, origin: v, radius, polys: [] };
    if (k > 0) group.mirrorSeg = rays[first].hits[k - 1];
    if (beam) {
      const r = rays[first];
      const sign = k % 2 === 0 ? 1 : -1;
      const leaves = Math.atan2(r.legs[l + 3] - v.y, r.legs[l + 2] - v.x);
      group.beamAxis = leaves + sign * (beam.axis - r.angle);
      group.beamHalf = beam.half;
      group.fades = [{ axis: group.beamAxis, half: beam.half, core: FLASHLIGHT.beamCore }];
    }
    groups.set(key, group);
  }

  const l = k * LEG_STRIDE;
  const poly: Point[] = [];
  if (k === 0)
    poly.push(origin); // every direct leg starts at the light itself
  else for (let i = first; i <= last; i++) poly.push({ x: rays[i].legs[l], y: rays[i].legs[l + 1] });
  for (let i = last; i >= first; i--) poly.push({ x: rays[i].legs[l + 2], y: rays[i].legs[l + 3] });
  group.polys.push(poly);
};

// Casts `baseRayCount` rays evenly across [startAngle, startAngle + span] (pass span = 2π for an
// omnidirectional light), refines edges, and groups the resulting strips by mirror chain.
export const castLight = (
  origin: Point,
  startAngle: number,
  span: number,
  baseRayCount: number,
  budget: number,
  scene: Scene,
  maxBounces: number,
  mirrorSpill = false, // add spill past the edges of the light off each mirror (see addMirrorSpill)
  soft = false, // add soft shadow edges (see addPenumbras)
): LightResult => {
  const maxLegs = maxBounces + 1;
  // Pooled rays only ever grow: a ray with room for more legs works fine for fewer.
  if (poolLegs < maxLegs) {
    pool = [];
    poolLegs = maxLegs;
  }
  poolUsed = 0;
  rays.length = 0;
  cullSegments(scene, origin.x, origin.y, budget);

  // Inclusive of both ends: for a full circle the last ray duplicates the first, which closes the loop.
  let prev = nextRay(maxLegs)!;
  trace(prev, origin.x, origin.y, startAngle, budget, scene, maxLegs);
  rays.push(prev);
  for (let i = 1; i <= baseRayCount; i++) {
    const next = nextRay(maxLegs) ?? new RayPath(maxLegs);
    trace(next, origin.x, origin.y, startAngle + span * (i / baseRayCount), budget, scene, maxLegs);
    refine(prev, next, RAYS.refineDepth, origin.x, origin.y, budget, scene, maxLegs);
    rays.push(next);
    prev = next;
  }

  // Walk the rays once per leg depth, joining consecutive runs that share the same mirror chain.
  // Depth 0 goes first, so the direct light is always groups[0].
  const groups = new Map<number, LightGroup>();
  const beam = span < Math.PI * 2 - 1e-9 ? { axis: startAngle + span / 2, half: span / 2 } : null;
  for (let k = 0; k < maxLegs; k++) {
    let runStart = -1;
    for (let i = 0; i < rays.length; i++) {
      const a = rays[i];
      const b = rays[i + 1];
      const joined = b !== undefined && a.legCount > k && b.legCount > k && a.keys[k] === b.keys[k];
      if (joined && runStart < 0) runStart = i;
      if (!joined && runStart >= 0) {
        emitStrip(groups, k, runStart, i, origin, budget, beam);
        runStart = -1;
      }
    }
  }

  // Light off a mirror fades toward the edges of what the mirror catches: the angle its lit area
  // spans from the virtual source.
  for (const g of groups.values()) {
    if (g.depth === 0) continue;
    let sx = 0;
    let sy = 0;
    for (const poly of g.polys)
      for (const p of poly) {
        const dx = p.x - g.origin.x;
        const dy = p.y - g.origin.y;
        const len = Math.hypot(dx, dy) || 1;
        sx += dx / len;
        sy += dy / len;
      }
    const axis = Math.atan2(sy, sx);
    let half = 0;
    for (const poly of g.polys)
      for (const p of poly) {
        half = Math.max(half, Math.abs(wrapAngle(Math.atan2(p.y - g.origin.y, p.x - g.origin.x) - axis)));
      }
    if (half > 1e-6) (g.fades ??= []).push({ axis, half, core: FLASHLIGHT.beamCore });
  }

  const result = [...groups.values()];
  if (soft) for (const g of result) addPenumbras(g, scene); // (while this light's nearby segments are culled)
  if (mirrorSpill) for (const g of [...result]) if (g.depth > 0) result.push(...addMirrorSpill(g, scene));
  return { groups: result, rayCount: rays.length };
};

// How many (dx, dy)s from (x, y) to the first segment hit, up to `max`: against every segment, or
// only those culled for the light being cast (`nearby`).
const hitDistance = (scene: Scene, x: number, y: number, dx: number, dy: number, max: number, nearby: boolean) => {
  const c = scene.coords;
  const n = nearby ? activeCount : scene.count;
  let best = max;
  for (let i = 0; i < n; i++) {
    const o = (nearby ? activeSegs[i] : i) * SCENE_STRIDE;
    const ex = c[o + 2] - c[o];
    const ey = c[o + 3] - c[o + 1];
    const denom = dx * ey - dy * ex;
    if (denom > -1e-12 && denom < 1e-12) continue;
    const wx = c[o] - x;
    const wy = c[o + 1] - y;
    const t = (wx * ey - wy * ex) / denom;
    if (t < 0 || t >= best) continue;
    const u = (wx * dy - wy * dx) / denom;
    if (u >= 0 && u <= 1) best = t;
  }
  return best;
};

// How far from `from` toward `to` you get before hitting any segment (or all the way).
export const clearDistance = (scene: Scene, from: Point, to: Point) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return hitDistance(scene, from.x, from.y, dx, dy, 1, false) * Math.hypot(dx, dy);
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

// Total brightness at `p` across every light group that reaches it. Light adds, same as on screen.
// A beam, and light off a mirror, is dimmer toward its edges (fadeAt), a spill dimmer overall (strength).
export const brightnessAt = (p: Point, groups: LightGroup[]) => {
  let total = 0;
  for (const g of groups) {
    if (!insideAny(p, g.polys)) continue;
    const across = fadeAt(p, g);
    total += falloffAt(Math.hypot(p.x - g.origin.x, p.y - g.origin.y) / g.radius) * across * (g.strength ?? 1);
  }
  return total;
};

// The fear rule: empty-handed, you can only walk to `p` if some point within PLAYER.fearReach of it is
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

// Spill off a mirror: past each side of a reflection, the light carries on dim
// (FLASHLIGHT.spill.strength), fading over the extra width a flashlight's spill adds to its beam,
// shadowed but not bounced again. It starts on the mirror's line past its end, so it only spills
// where the mirror stops.
const MIRROR_SPILL_RAYS = 6; // per side
const addMirrorSpill = (g: LightGroup, scene: Scene): LightGroup[] => {
  const window = g.fades?.[g.fades.length - 1];
  if (g.mirrorSeg === undefined || g.mirrorSeg < 0 || !window || g.spill) return [];
  const c = scene.coords;
  const o = g.mirrorSeg * SCENE_STRIDE;
  const mx = c[o];
  const my = c[o + 1];
  const ex = c[o + 2] - mx;
  const ey = c[o + 3] - my;
  const extra = window.half * (FLASHLIGHT.spill.cone / FLASHLIGHT.cone - 1);
  const others = g.fades!.slice(0, -1); // a beam's own fade still applies
  const spills: LightGroup[] = [];
  for (const side of [-1, 1]) {
    const starts: Point[] = [];
    const ends: Point[] = [];
    for (let i = 0; i <= MIRROR_SPILL_RAYS; i++) {
      const a = window.axis + side * (window.half + (extra * i) / MIRROR_SPILL_RAYS);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // Where this ray crosses the mirror's line: it must be past the mirror's end.
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-12) continue;
      const wx = mx - g.origin.x;
      const wy = my - g.origin.y;
      const t = (wx * ey - wy * ex) / denom;
      const u = (wx * dy - wy * dx) / denom;
      if (t <= 0 || (u >= 0 && u <= 1) || t >= g.radius) continue;
      const start = { x: g.origin.x + dx * t, y: g.origin.y + dy * t };
      const from = { x: start.x + dx * 0.01, y: start.y + dy * 0.01 };
      const d = clearDistance(scene, from, { x: from.x + dx * (g.radius - t), y: from.y + dy * (g.radius - t) });
      starts.push(start);
      ends.push({ x: from.x + dx * d, y: from.y + dy * d });
    }
    if (starts.length < 2) continue;
    spills.push({
      depth: g.depth,
      origin: g.origin,
      radius: g.radius,
      polys: [[...starts, ...ends.reverse()]],
      strength: FLASHLIGHT.spill.strength * (g.strength ?? 1),
      spill: true,
      beamAxis: g.beamAxis,
      beamHalf: g.beamHalf,
      flame: g.flame,
      fades: [...others, { axis: window.axis, half: window.half + extra, core: window.half / (window.half + extra) }],
    });
  }
  return spills;
};

// Soft shadows (drawn only: plates, walking and fog memory keep the hard edge). A real light isn't a
// point, so past a corner its shadow's edge fades over the angle the light's size
// (RAYS.softShadowSize) makes from the corner. A corner is where two neighbouring rays end at very
// different distances; from just past it, a fan of rays sweeps into the shadow, each stopped by
// whatever it meets. Run straight after tracing, so the fan only tests this light's culled segments.
const SHADOW_EDGE_MAX_GAP = (0.25 * Math.PI) / 180; // neighbouring rays further apart than this aren't at a corner
const addPenumbras = (g: LightGroup, scene: Scene) => {
  if (g.spill) return;
  const o = g.origin;
  const penumbras: Penumbra[] = [];
  for (const poly of g.polys) {
    // The rays' ends: after the light itself for direct light, or the second half of a strip.
    const hits = g.depth === 0 ? poly.slice(1) : poly.slice(poly.length / 2);
    for (let i = 0; i + 1 < hits.length; i++) {
      const a = hits[i];
      const b = hits[i + 1];
      const da = Math.hypot(a.x - o.x, a.y - o.y);
      const db = Math.hypot(b.x - o.x, b.y - o.y);
      if (Math.abs(da - db) < RAYS.edgeMinJump) continue;
      const near = da < db ? a : b;
      const far = da < db ? b : a;
      const dNear = Math.min(da, db);
      const aNear = Math.atan2(near.y - o.y, near.x - o.x);
      const aFar = Math.atan2(far.y - o.y, far.x - o.x);
      const gap = wrapAngle(aNear - aFar);
      if (Math.abs(gap) > SHADOW_EDGE_MAX_GAP || dNear < 1) continue;
      // Pivot on the grazing ray just past the corner (the near ray's end is on the wall's face, so
      // a fan from there would start inside the wall), and turn toward the near side: the shadow.
      const apex = { x: o.x + Math.cos(aFar) * dNear, y: o.y + Math.sin(aFar) * dNear };
      const width = Math.min(RAYS.softShadowMax, Math.atan2(RAYS.softShadowSize, dNear)) * Math.sign(gap);
      const reach = g.radius - dNear;
      if (reach <= 1) continue;
      const ends: Point[] = [];
      for (let j = 0; j <= RAYS.softShadowSteps; j++) {
        const angle = aFar + (width * j) / RAYS.softShadowSteps;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const d = hitDistance(scene, apex.x, apex.y, dx, dy, reach, true);
        ends.push({ x: apex.x + dx * d, y: apex.y + dy * d });
      }
      penumbras.push({ apex, ends });
    }
  }
  if (penumbras.length) g.penumbras = penumbras;
};

// A flashlight from `at` aimed along `aim`: its beam, and its spill (wider, dimmer, shorter), each
// with its own shadows and reflections. Shared by the game and the level editor, so both see the
// same light.
export const castFlashlight = (at: Point, aim: number, range: number, scene: Scene, soft = false) => {
  const beam = castLight(
    at,
    aim - FLASHLIGHT.cone / 2,
    FLASHLIGHT.cone,
    FLASHLIGHT.rayCount,
    range,
    scene,
    LIGHT.maxMirrorBounces,
    true,
    soft,
  );
  const spill = castLight(
    at,
    aim - FLASHLIGHT.spill.cone / 2,
    FLASHLIGHT.spill.cone,
    FLASHLIGHT.spill.rayCount,
    Math.max(1, range * FLASHLIGHT.spill.range),
    scene,
    LIGHT.maxMirrorBounces,
  );
  // The spill fades from where the beam ends (its first fade is its own, across it).
  for (const g of spill.groups) {
    g.strength = FLASHLIGHT.spill.strength;
    g.spill = true;
    if (g.fades?.[0]) g.fades[0].core = FLASHLIGHT.cone / FLASHLIGHT.spill.cone;
  }
  return { groups: [...beam.groups, ...spill.groups], rayCount: beam.rayCount + spill.rayCount };
};
