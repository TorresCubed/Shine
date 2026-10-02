import { polygonsPath, mirrorSegment } from "../core/util";
import { castLight, insideAny, brightnessAt } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import type { Point, Scene } from "../core/types";
import { LIGHT, FLAME, LIT_SURFACES } from "../core/consts";
import { player } from "../core/state";
import type { MirrorState } from "../core/state";
import { worldCanvas } from "./canvases";
import { signedArea, quadsPath } from "./geometry";
import type { Bounds } from "./geometry";
import { litFaces } from "./faces";

// Everything the player can see: in direct line of sight, and in any mirror they can see (the view
// is traced like light, bouncing off mirrors). It stops at wall faces, so points are pushed
// LIT_SURFACES.wallPenetration further along their sight line to keep the lit face band. Every polygon is
// wound the same way: a mirror flips winding, and the view is filled/clipped as one path with the
// nonzero rule, where oppositely wound overlaps would cancel into holes.
// It also sets viewFaces: the wall and door faces in sight, as bands into them (see litFaces).
let viewFaces: Point[][] = [];
export const computeView = (scene: Scene): Point[][] => {
  const origin = { x: player.x, y: player.y };
  const range = Math.hypot(worldCanvas.width, worldCanvas.height) * (LIGHT.maxMirrorBounces + 1);
  const { groups } = castLight(origin, 0, Math.PI * 2, FLAME.rayCount, range, scene, LIGHT.maxMirrorBounces);
  viewFaces = groups.flatMap(g => litFaces(g).flat());
  return groups.flatMap(g =>
    g.polys.map(poly => {
      const pushed = poly.map((p, i) => {
        if (g.depth === 0 && i === 0) return p; // the direct fan's shared corner, at the player
        const dx = p.x - g.origin.x, dy = p.y - g.origin.y, len = Math.hypot(dx, dy) || 1;
        return { x: p.x + dx / len * LIT_SURFACES.wallPenetration, y: p.y + dy / len * LIT_SURFACES.wallPenetration };
      });
      return signedArea(pushed) < 0 ? pushed.reverse() : pushed;
    }));
}

// What the lit layer is cut down to: the line of sight, plus a LIT_SURFACES.wallPenetration band along
// every visible wall face, so a lit face band shows however shallow the angle you see the wall at.
// (The view's own push into walls runs along sight lines, which barely enters a wall seen edge-on.)
const viewMask = document.createElement('canvas');
const viewMaskCtx = viewMask.getContext('2d')!;
export const drawViewMask = (view: Point[][], b: Bounds) => {
  if (viewMask.width !== worldCanvas.width || viewMask.height !== worldCanvas.height) {
    viewMask.width = worldCanvas.width;
    viewMask.height = worldCanvas.height;
  }
  viewMaskCtx.clearRect(b.x, b.y, b.w, b.h);
  viewMaskCtx.fillStyle = '#fff';
  polygonsPath(viewMaskCtx, view);
  viewMaskCtx.fill();
  viewMaskCtx.beginPath();
  quadsPath(viewMaskCtx, viewFaces);
  viewMaskCtx.fill();
  return viewMask;
}

// A mirror is seen if any point just off either face, anywhere along it, is lit and in line of sight.
export const mirrorSeen = (m: MirrorState, groups: LightGroup[], view: Point[][]) => {
  const seg = mirrorSegment(m, m.shownStep);
  const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const nx = -(seg.y2 - seg.y1) / len * 4, ny = (seg.x2 - seg.x1) / len * 4;
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = seg.x1 + (seg.x2 - seg.x1) * t, y = seg.y1 + (seg.y2 - seg.y1) * t;
    for (const p of [{ x: x + nx, y: y + ny }, { x: x - nx, y: y - ny }]) {
      if (insideAny(p, view) && brightnessAt(p, groups) > 0) return true;
    }
  }
  return false;
}
