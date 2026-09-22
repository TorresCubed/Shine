import type { Mirror, Segment } from "./interfaces";
import { walls } from "./consts";

const getWallCorners = (w: typeof walls[0]) => {
  return [
    { x: w.x, y: w.y },
    { x: w.x + w.w, y: w.y },
    { x: w.x + w.w, y: w.y + w.h },
    { x: w.x, y: w.y + w.h },
  ];
}

const wallToSegments = (w: typeof walls[0]): Segment[] => {
  const c = getWallCorners(w);
  return [0, 1, 2, 3].map(i => ({ x1: c[i].x, y1: c[i].y, x2: c[(i + 1) % 4].x, y2: c[(i + 1) % 4].y }));
}

export const getBlockingSegments = (wallsList: typeof walls, mirrorsList: Mirror[]): Segment[] => {
  const segs: Segment[] = [];
  for (const w of wallsList) segs.push(...wallToSegments(w));
  for (const m of mirrorsList) segs.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 });
  return segs;
}