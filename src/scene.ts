import type { Scene, Segment, Wall } from "./interfaces";
import type { MirrorState } from "./state";
import { SCENE_STRIDE } from "./interfaces";
import { mirrorSegment } from "./util";

const wallEdges = (w: Wall): Segment[] => {
  const x2 = w.x + w.w, y2 = w.y + w.h;
  return [
    { x1: w.x, y1: w.y, x2, y2: w.y },
    { x1: x2, y1: w.y, x2, y2 },
    { x1: x2, y1: y2, x2: w.x, y2 },
    { x1: w.x, y1: y2, x2: w.x, y2: w.y },
  ];
}

// Walls, mirrors, and other light-blocking segments (door leaves), which absorb light like walls.
// Rebuilt only when the geometry changes (doors swinging, mirrors turning), detected by a cheap
// content fingerprint.
let cachedFingerprint = '';
let cachedScene: Scene = { count: 0, coords: new Float64Array(0), mirrorIndex: new Int32Array(0), mirrorCount: 0 };

export const getScene = (walls: Wall[], mirrors: MirrorState[], blockers: Segment[] = []): Scene => {
  let fingerprint = '';
  for (const w of walls) fingerprint += `${w.x},${w.y},${w.w},${w.h};`;
  for (const m of mirrors) fingerprint += `${m.gridX},${m.gridY},${m.shownStep};`;
  for (const b of blockers) fingerprint += `${b.x1},${b.y1},${b.x2},${b.y2};`;
  if (fingerprint === cachedFingerprint) return cachedScene;

  const segs: Segment[] = [];
  const owners: number[] = [];
  for (const w of walls) for (const s of wallEdges(w)) { segs.push(s); owners.push(-1); }
  for (const b of blockers) { segs.push(b); owners.push(-1); }
  mirrors.forEach((m, i) => { segs.push(mirrorSegment(m, m.shownStep)); owners.push(i); });

  const coords = new Float64Array(segs.length * SCENE_STRIDE);
  segs.forEach((s, i) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    coords.set([s.x1, s.y1, s.x2, s.y2, -(s.y2 - s.y1) / len, (s.x2 - s.x1) / len], i * SCENE_STRIDE);
  });

  cachedFingerprint = fingerprint;
  cachedScene = { count: segs.length, coords, mirrorIndex: Int32Array.from(owners), mirrorCount: mirrors.length };
  return cachedScene;
}
