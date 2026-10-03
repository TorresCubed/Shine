import { polygonsPath, mirrorSegment, normalOf } from '../core/util';
import { castLight } from '../light/rayTracer';
import { insideAny, brightnessAt } from '../light/brightness';
import type { LightGroup } from '../light/rayTracer';
import type { MirrorState, Point, Scene } from '../core/types';
import { LIGHT, FLAME, LIT_SURFACES } from '../core/consts';
import { player } from '../core/state';
import { worldCanvas, fitToWorld } from './canvases';
import { signedArea, quadsPath } from './geometry';
import type { Bounds } from './geometry';
import { litFaces } from './faces';

// Everything the player can see, directly or in a mirror (traced like light), pushed
// LIT_SURFACES.wallPenetration past wall faces to keep the lit band, and wound one way so it fills
// without holes. Also sets viewFaces, the faces in sight.
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
        const dx = p.x - g.origin.x;
        const dy = p.y - g.origin.y;
        const len = Math.hypot(dx, dy) || 1;
        return {
          x: p.x + (dx / len) * LIT_SURFACES.wallPenetration,
          y: p.y + (dy / len) * LIT_SURFACES.wallPenetration,
        };
      });
      return signedArea(pushed) < 0 ? pushed.reverse() : pushed;
    }),
  );
};

// What the lit layer is cut to: the line of sight plus a band along every visible face, so a lit face
// shows even when seen edge-on.
const viewMask = document.createElement('canvas');
const viewMaskCtx = viewMask.getContext('2d')!;
export const drawViewMask = (view: Point[][], b: Bounds) => {
  fitToWorld(viewMask);
  viewMaskCtx.clearRect(b.x, b.y, b.w, b.h);
  viewMaskCtx.fillStyle = '#fff';
  polygonsPath(viewMaskCtx, view);
  viewMaskCtx.fill();
  viewMaskCtx.beginPath();
  quadsPath(viewMaskCtx, viewFaces);
  viewMaskCtx.fill();
  return viewMask;
};

// A mirror is seen if a point just off either face is lit and in sight.
export const mirrorSeen = (m: MirrorState, groups: LightGroup[], view: Point[][]) => {
  const seg = mirrorSegment(m, m.shownStep);
  const n = normalOf(seg, 4);
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = seg.x1 + (seg.x2 - seg.x1) * t;
    const y = seg.y1 + (seg.y2 - seg.y1) * t;
    for (const p of [
      { x: x + n.x, y: y + n.y },
      { x: x - n.x, y: y - n.y },
    ]) {
      if (insideAny(p, view) && brightnessAt(p, groups) > 0) return true;
    }
  }
  return false;
};
