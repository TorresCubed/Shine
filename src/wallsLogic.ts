import type { Mirror, Scene, Segment } from "./interfaces";
import { SCENE_STRIDE } from "./interfaces";
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

// Walls and mirrors are static today, so this rebuilt identical output every frame for nothing.
// Cached on a cheap content fingerprint (not just array identity) so it stays correct once doors
// or spinning mirrors start actually changing this geometry at runtime.
let cachedFingerprint = '';
let cachedScene: Scene = { count: 0, coords: new Float64Array(0), mirrorIndex: new Int32Array(0), mirrorCount: 0 };

export const getScene = (wallsList: typeof walls, mirrorsList: Mirror[]): Scene => {
  let fingerprint = '';
  for (const w of wallsList) fingerprint += `${w.x},${w.y},${w.w},${w.h};`;
  for (const m of mirrorsList) fingerprint += `${m.x1},${m.y1},${m.x2},${m.y2};`;

  if (fingerprint === cachedFingerprint) return cachedScene;

  const segs: Segment[] = [];
  const owners: number[] = [];
  for (const w of wallsList) for (const s of wallToSegments(w)) { segs.push(s); owners.push(-1); }
  mirrorsList.forEach((m, i) => { segs.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 }); owners.push(i); });

  const coords = new Float64Array(segs.length * SCENE_STRIDE);
  segs.forEach((s, i) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    const o = i * SCENE_STRIDE;
    coords[o] = s.x1; coords[o + 1] = s.y1; coords[o + 2] = s.x2; coords[o + 3] = s.y2;
    coords[o + 4] = -(s.y2 - s.y1) / len;
    coords[o + 5] = (s.x2 - s.x1) / len;
  });

  cachedFingerprint = fingerprint;
  cachedScene = { count: segs.length, coords, mirrorIndex: Int32Array.from(owners), mirrorCount: mirrorsList.length };
  return cachedScene;
}
