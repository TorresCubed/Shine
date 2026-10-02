import type { GridPos, Point, Segment } from "./interfaces";
import { GRID_SIZE, MIRROR } from "./consts";

export const cellCenter = (c: GridPos): Point => ({ x: (c.gridX + 0.5) * GRID_SIZE, y: (c.gridY + 0.5) * GRID_SIZE });

export const sameCell = (a: GridPos, b: GridPos) => a.gridX === b.gridX && a.gridY === b.gridY;

// A mirror's segment at orientation `step` (fractional mid-turn).
export const mirrorSegment = (m: GridPos, step: number): Segment => {
  const c = cellCenter(m), a = step * Math.PI / MIRROR.steps;
  const dx = Math.cos(a) * MIRROR.halfLength, dy = Math.sin(a) * MIRROR.halfLength;
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

// Ease-in-out cubic: 0 to 1, starting and stopping gently. Used for every animated transition.
export const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Whether two segments cross (touching ends count).
export const segmentsCross = (a: Segment, b: Segment) => {
  const side = (s: Segment, x: number, y: number) => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) <= 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) <= 0;
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
