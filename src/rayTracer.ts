import type { Point, Scene } from "./interfaces";
import { SCENE_STRIDE } from "./interfaces";
import { RAY_REFINE_DEPTH, MAX_TRACED_RAYS } from "./consts";

// Forward ray tracing. Rays leave the light, and each one bounces off mirrors (angle of incidence =
// angle of reflection) until it hits a wall, runs out of range, or runs out of bounces.
//
// For the lit area, adjacent rays are paired up into strips (quads between ray i and ray i+1),
// one strip per leg. Two neighbouring rays only share a leg-k strip if they bounced off the exact
// same chain of mirrors to get there, so a strip never bridges two different reflections.

const LEG_STRIDE = 6; // fromX, fromY, toX, toY, virtualX, virtualY
const HIT_EPSILON = 1e-6;

// One traced ray. Everything lives in preallocated typed arrays and the objects are pooled across
// frames, so the per-frame trace allocates nothing (apart from the output polygons).
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
  polys: Point[][];
}

export interface LightResult {
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
    const x1 = c[o], y1 = c[o + 1], ex = c[o + 2] - x1, ey = c[o + 3] - y1;
    const lenSq = ex * ex + ey * ey;
    let t = lenSq === 0 ? 0 : ((ox - x1) * ex + (oy - y1) * ey) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * ex - ox, py = y1 + t * ey - oy;
    if (px * px + py * py <= budgetSq) activeSegs[activeCount++] = s;
  }
}

const trace = (ray: RayPath, ox: number, oy: number, angle: number, budget: number, scene: Scene, maxLegs: number) => {
  const c = scene.coords;
  const keyBase = scene.mirrorCount + 1;
  let dx = Math.cos(angle), dy = Math.sin(angle);
  let x = ox, y = oy, travelled = 0, key = 0, ignore = -1;

  ray.angle = angle;
  ray.legCount = 0;

  for (let leg = 0; leg < maxLegs; leg++) {
    let best = budget - travelled;
    let bestSeg = -1;

    for (let i = 0; i < activeCount; i++) {
      const s = activeSegs[i];
      if (s === ignore) continue; // a flat mirror can't be hit again straight after bouncing off it
      const o = s * SCENE_STRIDE;
      const ex = c[o + 2] - c[o], ey = c[o + 3] - c[o + 1];
      const denom = dx * ey - dy * ex;
      if (denom > -1e-12 && denom < 1e-12) continue; // parallel
      const wx = c[o] - x, wy = c[o + 1] - y;
      const t = (wx * ey - wy * ex) / denom; // distance along the ray (direction is unit length)
      if (t <= HIT_EPSILON || t >= best) continue;
      const u = (wx * dy - wy * dx) / denom; // position along the segment, 0..1
      if (u < 0 || u > 1) continue;
      best = t;
      bestSeg = s;
    }

    const hx = x + dx * best, hy = y + dy * best;
    const l = leg * LEG_STRIDE;
    ray.legs[l] = x; ray.legs[l + 1] = y;
    ray.legs[l + 2] = hx; ray.legs[l + 3] = hy;
    ray.legs[l + 4] = x - dx * travelled; ray.legs[l + 5] = y - dy * travelled;
    ray.keys[leg] = key;
    ray.hits[leg] = bestSeg;
    ray.legCount++;

    travelled += best;
    if (bestSeg < 0) break; // ran out of range in open space
    const mirror = scene.mirrorIndex[bestSeg];
    if (mirror < 0) break;  // wall absorbs it

    const o = bestSeg * SCENE_STRIDE;
    const nx = c[o + 4], ny = c[o + 5];
    const dot = dx * nx + dy * ny;
    dx -= 2 * dot * nx;
    dy -= 2 * dot * ny;
    x = hx; y = hy;
    key = key * keyBase + mirror + 1;
    ignore = bestSeg;
  }
}

const nextRay = (maxLegs: number): RayPath | null => {
  if (poolUsed >= MAX_TRACED_RAYS) return null;
  if (poolUsed === pool.length) pool.push(new RayPath(maxLegs));
  return pool[poolUsed++];
}

// Neighbouring rays that hit the same surfaces at every leg they share can be joined by a strip
// safely. If they don't, there's an edge somewhere between them worth resolving.
const sameHits = (a: RayPath, b: RayPath) => {
  const n = Math.min(a.legCount, b.legCount);
  for (let i = 0; i < n; i++) if (a.hits[i] !== b.hits[i]) return false;
  return true;
}

// Bisects between a and b while they disagree, appending new rays to `rays` in angular order.
const refine = (
  a: RayPath, b: RayPath, depth: number,
  ox: number, oy: number, budget: number, scene: Scene, maxLegs: number
) => {
  if (depth <= 0 || sameHits(a, b)) return;
  const mid = nextRay(maxLegs);
  if (!mid) return;
  trace(mid, ox, oy, (a.angle + b.angle) / 2, budget, scene, maxLegs);
  refine(a, mid, depth - 1, ox, oy, budget, scene, maxLegs);
  rays.push(mid);
  refine(mid, b, depth - 1, ox, oy, budget, scene, maxLegs);
}

// Emits the strip polygon covering leg k of rays[first..last] into its light group.
const emitStrip = (groups: Map<number, LightGroup>, k: number, first: number, last: number, origin: Point) => {
  const key = rays[first].keys[k];
  let group = groups.get(key);
  if (!group) {
    const l = k * LEG_STRIDE;
    const v = k === 0 ? origin : { x: rays[first].legs[l + 4], y: rays[first].legs[l + 5] };
    group = { depth: k, origin: v, polys: [] };
    groups.set(key, group);
  }

  const l = k * LEG_STRIDE;
  const poly: Point[] = [];
  if (k === 0) poly.push(origin); // every direct leg starts at the light itself
  else for (let i = first; i <= last; i++) poly.push({ x: rays[i].legs[l], y: rays[i].legs[l + 1] });
  for (let i = last; i >= first; i--) poly.push({ x: rays[i].legs[l + 2], y: rays[i].legs[l + 3] });
  group.polys.push(poly);
}

// Casts `baseRayCount` rays evenly across [startAngle, startAngle + span] (pass span = 2π for an
// omnidirectional light), refines edges, and groups the resulting strips by mirror chain.
export const castLight = (
  origin: Point,
  startAngle: number,
  span: number,
  baseRayCount: number,
  budget: number,
  scene: Scene,
  maxBounces: number
): LightResult => {
  const maxLegs = maxBounces + 1;
  if (poolLegs !== maxLegs) { pool = []; poolLegs = maxLegs; }
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
    refine(prev, next, RAY_REFINE_DEPTH, origin.x, origin.y, budget, scene, maxLegs);
    rays.push(next);
    prev = next;
  }

  // Walk the rays once per leg depth, joining consecutive runs that share the same mirror chain.
  // Depth 0 goes first, so the direct light is always groups[0].
  const groups = new Map<number, LightGroup>();
  for (let k = 0; k < maxLegs; k++) {
    let runStart = -1;
    for (let i = 0; i < rays.length; i++) {
      const a = rays[i], b = rays[i + 1];
      const joined = b !== undefined && a.legCount > k && b.legCount > k && a.keys[k] === b.keys[k];
      if (joined && runStart < 0) runStart = i;
      if (!joined && runStart >= 0) { emitStrip(groups, k, runStart, i, origin); runStart = -1; }
    }
  }

  return { groups: [...groups.values()], rayCount: rays.length };
}
