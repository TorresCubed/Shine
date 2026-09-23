import type { Mirror, Segment } from "./interfaces";
import { reflectPointAcrossLine, normalizeAngle } from "./util";
import { castRayBlocking, castRaySegmentHit } from "./lightLogic";

// export const getMirrorNormal = (m: Mirror, incoming: { x: number; y: number }) =>  {
//   const dx = m.x2 - m.x1;
//   const dy = m.y2 - m.y1;
//   const len = Math.hypot(dx, dy);
//   let nx = -dy / len;
//   let ny = dx / len;
//   // Flip the normal so it always faces back toward the incoming ray
//   if (nx * incoming.x + ny * incoming.y > 0) {
//     nx = -nx;
//     ny = -ny;
//   }
//   return { x: nx, y: ny };
// }

const mirrorAsSegment = (m: Mirror): Segment => ({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 });

// Like castRayBlocking, but if this ray's source is itself a virtual light bounced off
// `sourceMirror`, the leg from that source up to sourceMirror's own surface is fictional (same
// reasoning as the mirror-surface skip below) and can't be occluded by anything real. Only once
// the ray has actually crossed sourceMirror's surface does real geometry get to block it.
//
// Returns null if `sourceMirror` is set but this ray doesn't actually cross its real segment —
// that means this particular angle isn't a physically valid path back through that mirror at all,
// so it must not be treated as reaching anything (castRayBlocking's "no hit" default of the far
// point would otherwise look identical to "unobstructed", which is wrong here).
const castFromSource = (
  source: { x: number; y: number },
  sourceMirror: Mirror | undefined,
  angle: number,
  realSegments: Segment[],
  maxDistance: number
): { x: number; y: number } | null => {
  if (!sourceMirror) return castRayBlocking(source, angle, realSegments, maxDistance);

  const crossPoint = castRaySegmentHit(source, angle, mirrorAsSegment(sourceMirror), maxDistance);
  if (!crossPoint) return null;

  const distToCross = Math.hypot(crossPoint.x - source.x, crossPoint.y - source.y);
  const remaining = maxDistance - distToCross;
  if (remaining <= 0) return crossPoint;
  return castRayBlocking(crossPoint, angle, realSegments, remaining);
}

export const  computeMirrorPolygon = (
  light: { x: number; y: number },
  mirror: Mirror,
  allSegments: Segment[],
  maxDistance: number,
  lightCone?: { facingAngle: number; halfAngle: number },
  // Set when `light` is itself a virtual light bounced off another mirror (multi-bounce chains) —
  // see castFromSource above for why this matters for occlusion.
  sourceMirror?: Mirror
): { x: number; y: number }[] | null => {
  const m1 = { x: mirror.x1, y: mirror.y1 };
  const m2 = { x: mirror.x2, y: mirror.y2 };

  const otherSegments = allSegments.filter(s =>
    !(s.x1 === mirror.x1 && s.y1 === mirror.y1 && s.x2 === mirror.x2 && s.y2 === mirror.y2)
  );

  // For the leg *after* crossing sourceMirror's surface, sourceMirror itself must also be
  // excluded — that crossing point sits exactly on sourceMirror's segment, so leaving it in would
  // make the ray immediately (falsely) re-intersect the mirror it just came from at ~zero distance.
  const realOcclusionSegments = sourceMirror
    ? otherSegments.filter(s => !(s.x1 === sourceMirror.x1 && s.y1 === sourceMirror.y1 && s.x2 === sourceMirror.x2 && s.y2 === sourceMirror.y2))
    : otherSegments;

  // Skip mirrors the real light can't actually reach — out of range, blocked by a wall, or (for
  // the flashlight) outside its cone. Without this, the reflection below is computed purely from
  // geometry and shows up even when nothing is actually hitting the mirror.
  const mirrorSamplePoints = [m1, m2, { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 }];
  const isMirrorLit = mirrorSamplePoints.some(pt => {
    const dist = Math.hypot(pt.x - light.x, pt.y - light.y);
    if (dist > maxDistance) return false;
    const angle = Math.atan2(pt.y - light.y, pt.x - light.x);
    if (lightCone) {
      const rel = normalizeAngle(angle - (lightCone.facingAngle - lightCone.halfAngle));
      if (rel > lightCone.halfAngle * 2) return false;
    }
    const hit = castFromSource(light, sourceMirror, angle, realOcclusionSegments, maxDistance);
    if (!hit) return false;
    const hitDist = Math.hypot(hit.x - light.x, hit.y - light.y);
    return hitDist >= dist - 1; // small tolerance for float error
  });
  if (!isMirrorLit) return null;

  const virtualLight = reflectPointAcrossLine(light, m1, m2);

  // Decide corner order by which side of the mirror the real light sits on —
  // stable frame-to-frame, unlike picking the "shorter arc" which flips near 180°
  const mdx = m2.x - m1.x, mdy = m2.y - m1.y;
  const toLightX = light.x - m1.x, toLightY = light.y - m1.y;
  const cross = mdx * toLightY - mdy * toLightX;

  const startCorner = cross < 0 ? m1 : m2;
  const endCorner = cross < 0 ? m2 : m1;

  const startAngle = normalizeAngle(Math.atan2(startCorner.y - virtualLight.y, startCorner.x - virtualLight.x));
  const endAngle = normalizeAngle(Math.atan2(endCorner.y - virtualLight.y, endCorner.x - virtualLight.x));
  const diff = normalizeAngle(endAngle - startAngle);
  if (diff < 1e-6 || diff > Math.PI + 1e-6) return null; // degenerate, or light beyond mirror's edge-on plane

  const angles: number[] = [];
  const SWEEP_STEPS = 48;
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    // Keep these as raw offsets from startAngle — do NOT normalize yet
    angles.push(diff * (i / SWEEP_STEPS));
  }

  // Sharp shadow edges for anything the reflected view hits
  for (const s of otherSegments) {
    for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      const ang = normalizeAngle(Math.atan2(pt.y - virtualLight.y, pt.x - virtualLight.x));
      for (const candidate of [ang - 0.001, ang, ang + 0.001]) {
        const rel = normalizeAngle(candidate - startAngle);
        if (rel <= diff) {
          angles.push(rel);
        }
      }
    }
  }

    angles.sort((a, b) => a - b);
  const mirrorSegment = mirrorAsSegment(mirror);
  const farPoints = angles.map(offset => {
    const angle = normalizeAngle(startAngle + offset);

    // Unwind the reflection chain in reverse: first cross this mirror's own surface (fictional,
    // unoccludable — same reasoning as castFromSource above), then, if `light` is itself a bounce
    // off another mirror, cross that mirror's surface too — only after both crossings are we in
    // real space where actual occlusion applies.
    const mirrorHit = castRaySegmentHit(virtualLight, angle, mirrorSegment, maxDistance);
    if (!mirrorHit) return virtualLight; // sweep is built from this mirror's own corners, shouldn't happen
    let point = mirrorHit;
    let remaining = maxDistance - Math.hypot(mirrorHit.x - virtualLight.x, mirrorHit.y - virtualLight.y);
    if (remaining <= 0) return point;

    if (sourceMirror) {
      const sourceHit = castRaySegmentHit(point, angle, mirrorAsSegment(sourceMirror), remaining);
      if (!sourceHit) return point; // this angle doesn't trace back through a real reflection off sourceMirror
      remaining -= Math.hypot(sourceHit.x - point.x, sourceHit.y - point.y);
      point = sourceHit;
      if (remaining <= 0) return point;
    }

    return castRayBlocking(point, angle, realOcclusionSegments, remaining);
  });
    return [startCorner, ...farPoints, endCorner];
}

export interface MirrorReflectionHit {
  mirror: Mirror;
  poly: { x: number; y: number }[];
  virtualLight: { x: number; y: number };
  // Same as `budget` below — the light's total range, used as the falloff radius when rendering.
  hopBudget: number;
}

// Recursively bounces a light source (the player's own light, or a previous hop's virtual light)
// off every mirror it can reach, up to `maxBounces` hops deep.
//
// `budget` is the light's total range and stays the SAME at every depth — it's not something to
// spend down as we go. distance(virtualLight, target) already equals the true total physical path
// length back to the *original* light, however many mirrors it's bounced through (each reflection
// preserves distance to points on that mirror's own line, so the property composes through the
// whole chain) — computeMirrorPolygon already enforces that bound precisely, per ray, via its
// crossing-chain logic. An earlier version of this function tried to separately estimate "budget
// spent so far" from the straight-line distance to each mirror's midpoint and shrink the budget
// passed to the next hop — that was a redundant, inaccurate second accounting of the same
// distance, and it starved deeper bounces of range they should actually have had.
//
// `maxBounces` is the actual backstop against runaway recursion between two mirrors facing each
// other (which, physically, really would keep bouncing, just dimmer each time as the shared
// budget gets used up by the ever-longer real path length).
//
// Known limitation: occlusion for a hop only skips the fictional pre-crossing leg relative to the
// immediately previous mirror (via computeMirrorPolygon's `sourceMirror` param) — a wall sitting
// in the fictional space relative to an *earlier* mirror in a 3+ hop chain could in rare layouts
// still clip a deeper bounce incorrectly. Tighten further if that shows up in practice.
export const collectMirrorReflections = (
  sourceLight: { x: number; y: number },
  sourceCone: { facingAngle: number; halfAngle: number } | undefined,
  mirrors: Mirror[],
  segments: Segment[],
  budget: number,
  maxBounces: number,
  sourceMirror?: Mirror,
  out: MirrorReflectionHit[] = []
): MirrorReflectionHit[] => {
  if (maxBounces <= 0) return out;

  for (const m of mirrors) {
    if (m === sourceMirror) continue; // a mirror reflecting straight back into itself isn't meaningful

    const poly = computeMirrorPolygon(sourceLight, m, segments, budget, sourceCone, sourceMirror);
    if (!poly || poly.length < 3) continue;

    const virtualLight = reflectPointAcrossLine(sourceLight, { x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });
    out.push({ mirror: m, poly, virtualLight, hopBudget: budget });

    // Light leaving a mirror spreads back out in every direction from there — no cone restriction
    // on hops past the first, even if the original source was the flashlight.
    collectMirrorReflections(virtualLight, undefined, mirrors, segments, budget, maxBounces - 1, m, out);
  }

  return out;
}