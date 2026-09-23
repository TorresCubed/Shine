import { normalizeAngle } from "./util";
import type { Segment } from "./interfaces";

export const computeVisibilityPolygon = (light: { x: number; y: number }, segments: Segment[], maxDistance: number) => {
  const angles: number[] = [];
  for (const s of segments) {
    for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      const angle = Math.atan2(pt.y - light.y, pt.x - light.x);
      angles.push(normalizeAngle(angle - 0.001), normalizeAngle(angle), normalizeAngle(angle + 0.001));
    }
  }
  const SWEEP_STEPS = 180;
  for (let i = 0; i < SWEEP_STEPS; i++) angles.push(normalizeAngle((i / SWEEP_STEPS) * Math.PI * 2));
  angles.sort((a, b) => a - b);
  return angles.map(angle => castRayBlocking(light, angle, segments, maxDistance));
}

// Same idea as computeVisibilityPolygon, but swept across a narrow arc facing `facingAngle`
// instead of the full circle — used for the flashlight. Returns a pie-wedge polygon starting
// and ending at `origin` so it fills as a proper cone rather than just an open arc.
export const computeConeVisibilityPolygon = (
  origin: { x: number; y: number },
  facingAngle: number,
  halfAngle: number,
  segments: Segment[],
  maxDistance: number
) => {
  const startAngle = facingAngle - halfAngle;
  const span = halfAngle * 2;

  const angles: number[] = [0, span];
  const SWEEP_STEPS = 60;
  for (let i = 0; i <= SWEEP_STEPS; i++) angles.push(span * (i / SWEEP_STEPS));

  for (const s of segments) {
    for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      const angle = Math.atan2(pt.y - origin.y, pt.x - origin.x);
      for (const candidate of [angle - 0.001, angle, angle + 0.001]) {
        const rel = normalizeAngle(candidate - startAngle);
        if (rel <= span) angles.push(rel);
      }
    }
  }

  angles.sort((a, b) => a - b);
  const arcPoints = angles.map(offset => castRayBlocking(origin, startAngle + offset, segments, maxDistance));
  return [origin, ...arcPoints];
}

const lineIntersect = (
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null  => {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  const EPS = 1e-6;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

// Unlike castRayBlocking (closest blocker among many, always returns a point), this checks one
// specific segment and returns null if the ray doesn't actually cross it within maxDistance.
// Needed anywhere "did this ray genuinely cross this exact surface" matters on its own — e.g.
// unwinding a multi-bounce mirror chain, where falling through to a fake default point instead
// of a real null would silently treat an invalid reflection path as valid.
export const castRaySegmentHit = (
  origin: { x: number; y: number },
  angle: number,
  segment: Segment,
  maxDistance: number
): { x: number; y: number } | null => {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const farX = origin.x + dx * maxDistance, farY = origin.y + dy * maxDistance;
  return lineIntersect(origin.x, origin.y, farX, farY, segment.x1, segment.y1, segment.x2, segment.y2);
}

export const castRayBlocking = (origin: { x: number; y: number }, angle: number, segments: Segment[], maxDistance: number) => {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const farX = origin.x + dx * maxDistance, farY = origin.y + dy * maxDistance;
  let closest = { x: farX, y: farY };
  let closestDist = maxDistance;
  for (const s of segments) {
    const hit = lineIntersect(origin.x, origin.y, farX, farY, s.x1, s.y1, s.x2, s.y2);
    if (hit) {
      const dist = Math.hypot(hit.x - origin.x, hit.y - origin.y);
      if (dist < closestDist) { closestDist = dist; closest = hit; }
    }
  }
  return closest;
}



