import type { GridPos, Mirror, Point, Segment } from "./interfaces";
import { GRID_SIZE, MIRROR_HALF_LENGTH, MIRROR_STEPS } from "./consts";

export const cellCenter = (c: GridPos): Point => ({ x: (c.gridX + 0.5) * GRID_SIZE, y: (c.gridY + 0.5) * GRID_SIZE });

export const sameCell = (a: GridPos, b: GridPos) => a.gridX === b.gridX && a.gridY === b.gridY;

// A mirror's segment, optionally at a different orientation `step` than its current one.
export const mirrorSegment = (m: Mirror, step = m.step): Segment => {
  const c = cellCenter(m), a = step * Math.PI / MIRROR_STEPS;
  const dx = Math.cos(a) * MIRROR_HALF_LENGTH, dy = Math.sin(a) * MIRROR_HALF_LENGTH;
  return { x1: c.x - dx, y1: c.y - dy, x2: c.x + dx, y2: c.y + dy };
}

// Whether segment `s` passes within `margin` of the square centred on `c` with half-size `half`.
// Sampled along the segment, finely enough for short mirrors against the player's footprint.
export const segmentNearSquare = (s: Segment, c: Point, half: number, margin: number) => {
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = s.x1 + (s.x2 - s.x1) * t, y = s.y1 + (s.y2 - s.y1) * t;
    if (Math.abs(x - c.x) <= half + margin && Math.abs(y - c.y) <= half + margin) return true;
  }
  return false;
}

// Several polygons as subpaths of one path, so they fill in a single call.
export const polygonsPath = (targetCtx: CanvasRenderingContext2D, polygons: Point[][]) => {
  targetCtx.beginPath();
  for (const points of polygons) {
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) targetCtx.lineTo(points[i].x, points[i].y);
    targetCtx.closePath();
  }
}
