import type { Mirror, Segment } from "./interfaces";
import { reflectPointAcrossLine, normalizeAngle } from "./util";
import { castRayBlocking } from "./lightLogic";

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

export const  computeMirrorPolygon = (
  light: { x: number; y: number },
  mirror: Mirror,
  allSegments: Segment[],
  maxDistance: number
): { x: number; y: number }[] | null => {
  const m1 = { x: mirror.x1, y: mirror.y1 };
  const m2 = { x: mirror.x2, y: mirror.y2 };

  const otherSegments = allSegments.filter(s =>
    !(s.x1 === mirror.x1 && s.y1 === mirror.y1 && s.x2 === mirror.x2 && s.y2 === mirror.y2)
  );

  // Skip mirrors the real light can't actually reach — out of range, or blocked by a wall.
  // Without this, the reflection below is computed purely from geometry and shows up even
  // when nothing is actually hitting the mirror.
  const mirrorSamplePoints = [m1, m2, { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 }];
  const isMirrorLit = mirrorSamplePoints.some(pt => {
    const dist = Math.hypot(pt.x - light.x, pt.y - light.y);
    if (dist > maxDistance) return false;
    const angle = Math.atan2(pt.y - light.y, pt.x - light.x);
    const hit = castRayBlocking(light, angle, otherSegments, maxDistance);
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
  const mirrorSegment: Segment = { x1: m1.x, y1: m1.y, x2: m2.x, y2: m2.y };
  const farPoints = angles.map(offset => {
    const angle = normalizeAngle(startAngle + offset);
    // The leg from virtualLight up to the mirror surface is a mathematical shortcut, not a
    // real light path — nothing can occlude it. Only check for blockers on the real, physical
    // leg that continues past the mirror, using whatever range budget that leg has left.
    const mirrorHit = castRayBlocking(virtualLight, angle, [mirrorSegment], maxDistance);
    const distToMirrorHit = Math.hypot(mirrorHit.x - virtualLight.x, mirrorHit.y - virtualLight.y);
    const remaining = maxDistance - distToMirrorHit;
    if (remaining <= 0) return mirrorHit;
    return castRayBlocking(mirrorHit, angle, otherSegments, remaining);
  });
    return [startCorner, ...farPoints, endCorner];
}