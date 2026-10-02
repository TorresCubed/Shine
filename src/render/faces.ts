import { fadeAt } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import type { Point, Segment } from "../core/types";
import { GRID_SIZE, LIT_SURFACES, DOOR } from "../core/consts";
import { doors, doorLeaves } from "../core/state";
import type { DoorState } from "../core/state";
import { quadsPath } from "./geometry";
import { isWallCell } from "./walls";

// Lit wall faces, shaded by how squarely the light hits them (a face lit head-on is brighter than one
// it grazes) and, for a flashlight, by the beam's profile (brightest along its centre line, fading
// to its edges), from 55% up to the paint's own brightness. The brightest faces then glow: a copy of
// the paint added on top (`glow` of it, at full brightness), which brightens the wall while keeping
// its texture, rather than washing it out to white. Distance is handled by the caller's falloff.
// Edges are sorted into a few brightness bands so it's a handful of strokes, not one per edge.
const FACE_BANDS = 6;
// A light's lit faces: the edges of its outline that lie against a wall or a door, each drawn as a
// thin quad reaching LIT_SURFACES.wallPenetration into it, square to the edge on the side away from the
// light, so the band stays inside the solid with no clipping. Most of a light's outline is where it runs out of range,
// or along a mirror; only the edges against a face are drawn (stroking the whole outline and
// clipping it to the walls was most of a frame's GPU time on a phone). An edge is against a face if
// its midpoint, nudged a little that way, is in a wall cell or on a door leaf. (Square to the edge,
// not along the light's direction: a wall lit at a grazing angle would be missed that way.) The
// quads are sorted into FACE_BANDS by how brightly they light it.
// A door leaf is too thin for a band (and traced as its centre line, so light stops halfway through
// it): a leaf the light touches anywhere is lit whole, as brightly as the light hits it most squarely.
type FaceBands = Point[][][]; // [band][quad] = its 4 corners
type Leaf = { door: DoorState; s: Segment };
const FACE_PROBE = 2; // px
const faceTarget = (x: number, y: number, leaves: Leaf[]): 'wall' | Leaf | null => {
  // Doors first: an open leaf lies flat along its cell's side, often against a wall face, and is
  // still the door there.
  for (const leaf of leaves) {
    const { s } = leaf, ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const t = Math.max(0, Math.min(1, ((x - s.x1) * ex + (y - s.y1) * ey) / (ex * ex + ey * ey || 1)));
    if (Math.hypot(x - (s.x1 + ex * t), y - (s.y1 + ey * t)) <= DOOR.artWidth / 2) return leaf;
  }
  return isWallCell(Math.floor(x / GRID_SIZE), Math.floor(y / GRID_SIZE)) ? 'wall' : null;
}
export const litFaces = (group: LightGroup): FaceBands => {
  const bands: FaceBands = Array.from({ length: FACE_BANDS }, () => []);
  const leaves: Leaf[] = doors.flatMap(door => doorLeaves(door, door.openAmount).map(s => ({ door, s })));
  const litLeaves = new Map<Leaf, number>(); // each leaf the light touches, and its brightest band
  const o = group.origin;
  for (const poly of group.polys) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      if (group.depth === 0 && (i === 0 || j === 0)) continue; // the fan's sides, out from the light
      const a = poly[i], b = poly[j];
      const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey);
      if (len < 0.5) continue;
      const mx = (a.x + b.x) / 2 - o.x, my = (a.y + b.y) / 2 - o.y, md = Math.hypot(mx, my) || 1;
      // The edge's normal, on the side away from the light.
      let nx = -ey / len, ny = ex / len;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const target = faceTarget(o.x + mx + nx * FACE_PROBE, o.y + my + ny * FACE_PROBE, leaves);
      if (!target) continue;
      const cos = Math.abs(mx * -ey + my * ex) / (len * md); // incidence vs. the face
      const beam = fadeAt({ x: o.x + mx, y: o.y + my }, group);
      // sqrt softens the fall-off toward grazing angles, so a wall lit along its length doesn't
      // drop to a dark line.
      const band = Math.min(FACE_BANDS - 1, Math.floor(Math.sqrt(cos) * beam * FACE_BANDS));
      if (target !== 'wall') { litLeaves.set(target, Math.max(band, litLeaves.get(target) ?? 0)); continue; }
      const d = LIT_SURFACES.wallPenetration;
      bands[band].push([a, b, { x: b.x + nx * d, y: b.y + ny * d }, { x: a.x + nx * d, y: a.y + ny * d }]);
    }
  }
  for (const [{ s }, band] of litLeaves) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, h = DOOR.artWidth / 2;
    const nx = -(s.y2 - s.y1) / len * h, ny = (s.x2 - s.x1) / len * h;
    bands[band].push([{ x: s.x1 + nx, y: s.y1 + ny }, { x: s.x2 + nx, y: s.y2 + ny }, { x: s.x2 - nx, y: s.y2 - ny }, { x: s.x1 - nx, y: s.y1 - ny }]);
  }
  return bands;
}
// A light's lit faces, worked out once a frame (the light map and fog memory both use them). Each
// frame's lights are new objects, so last frame's drop out on their own.
const facesCache = new WeakMap<LightGroup, FaceBands>();
export const facesOf = (group: LightGroup) => {
  let bands = facesCache.get(group);
  if (!bands) facesCache.set(group, bands = litFaces(group));
  return bands;
}
// Each band's quads, with the light's falloff (`paint`), at `strength(v)` for the band's brightness v:
// into the light map at full strength head-on, darker toward grazing; into the glow map by how much
// brighter than its art a face glows in a strong light.
export const drawFaceLight = (c: CanvasRenderingContext2D, bands: FaceBands, paint: CanvasGradient, strength: (v: number) => number) => {
  bands.forEach((quads, band) => {
    if (quads.length === 0) return;
    const v = (band + 0.5) / FACE_BANDS, a = strength(v);
    if (a < 0.01) return; // too faint to see (a flame's glow on its dimmest faces)
    c.beginPath();
    quadsPath(c, quads);
    c.fillStyle = paint;
    c.globalAlpha = a;
    c.fill();
  });
  c.globalAlpha = 1;
}
