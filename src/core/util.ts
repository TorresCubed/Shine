import type { GridPos, Lamp, Point, Segment, Wall } from "./types";
import { GRID_SIZE, LIGHT, MIRROR } from "./consts";

export const cellCenter = (c: GridPos): Point => ({ x: (c.gridX + 0.5) * GRID_SIZE, y: (c.gridY + 0.5) * GRID_SIZE });
export const cellAt = (p: Point): GridPos => ({ gridX: Math.floor(p.x / GRID_SIZE), gridY: Math.floor(p.y / GRID_SIZE) });
export const sameCell = (a: GridPos, b: GridPos) => a.gridX === b.gridX && a.gridY === b.gridY;

export const insideWalls = (p: Point, walls: Wall[]) => walls.some(w => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h);

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// An angle wrapped into -π..π.
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// The normal to `s`, `length` long.
export const normalOf = (s: Segment, length: number): Point => {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
  return { x: -(s.y2 - s.y1) / len * length, y: (s.x2 - s.x1) / len * length };
}

// A mirror's segment at orientation `step` (fractional mid-turn).
export const mirrorSegment = (m: GridPos, step: number): Segment => {
  const c = cellCenter(m), a = step * Math.PI / MIRROR.steps;
  const dx = Math.cos(a) * MIRROR.halfLength, dy = Math.sin(a) * MIRROR.halfLength;
  return { x1: c.x - dx, y1: c.y - dy, x2: c.x + dx, y2: c.y + dy };
}

// Where a wall lamp shines from: the edge of the wall it hangs on.
export const lampSource = (l: Lamp): Point => {
  const c = cellCenter(l), out = GRID_SIZE / 2 - LIGHT.edgeGap;
  return { x: c.x + l.toWallX * out, y: c.y + l.toWallY * out };
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

// Ease-in-out cubic: 0 to 1, starting and stopping gently.
export const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Whether two segments cross (touching ends count).
export const segmentsCross = (a: Segment, b: Segment) => {
  const side = (s: Segment, x: number, y: number) => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) <= 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) <= 0;
}

// Several polygons as subpaths of one path, so they fill in a single call.
export const polygonsPath = (c: CanvasRenderingContext2D, polygons: Point[][]) => {
  c.beginPath();
  for (const points of polygons) {
    c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.closePath();
  }
}
