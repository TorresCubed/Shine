import type { Point, Segment } from "../core/types";
import { DOOR } from "../core/consts";
import { normalOf } from "../core/util";

// A rectangle of the world canvas, in world px.
export type Bounds = { x: number; y: number; w: number; h: number };

export const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export const intersect = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
}

export const copyRect = (to: CanvasRenderingContext2D, from: HTMLCanvasElement, b: Bounds) =>
  to.drawImage(from, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);

// Twice the signed area: its sign is the polygon's winding direction.
export const signedArea = (poly: Point[]) =>
  poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p.x * q.y - q.x * p.y; }, 0);

// A door leaf as a quad, DOOR.artWidth wide.
export const leafQuad = (s: Segment): Point[] => {
  const n = normalOf(s, DOOR.artWidth / 2);
  return [{ x: s.x1 + n.x, y: s.y1 + n.y }, { x: s.x2 + n.x, y: s.y2 + n.y }, { x: s.x2 - n.x, y: s.y2 - n.y }, { x: s.x1 - n.x, y: s.y1 - n.y }];
}

// All wound the same way, so where quads overlap (at a corner, a door against a wall) they don't
// cancel into a hole under the nonzero rule.
export const quadsPath = (c: CanvasRenderingContext2D, quads: Point[][]) => {
  for (const q of quads) {
    const order = signedArea(q) < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    c.moveTo(q[order[0]].x, q[order[0]].y);
    for (let k = 1; k < 4; k++) c.lineTo(q[order[k]].x, q[order[k]].y);
    c.closePath();
  }
}
