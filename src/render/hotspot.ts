import type { LightGroup } from '../light/rayTracer';
import { GRID_SIZE, FLASHLIGHT } from '../core/consts';
import { level } from '../core/state';
import { insideWalls } from '../core/util';
import { wallArt, wallMask } from './walls';

// Where a direct beam's centre line hits a wall: the point, distance, face angle, and how squarely (cos).
const beamWallHit = (group: LightGroup) => {
  if (group.beamAxis === undefined || group.spill || group.depth !== 0) return null;
  const o = group.origin;
  const dx = Math.cos(group.beamAxis);
  const dy = Math.sin(group.beamAxis);
  for (const poly of group.polys) {
    for (let i = 1; i + 1 < poly.length; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const wx = a.x - o.x;
      const wy = a.y - o.y;
      const t = (wx * ey - wy * ex) / denom;
      const u = (wx * dy - wy * dx) / denom;
      if (t <= 0 || u < 0 || u > 1) continue;
      const len = Math.hypot(ex, ey) || 1;
      const hit = {
        x: o.x + dx * t,
        y: o.y + dy * t,
        dist: t,
        faceAngle: Math.atan2(ey, ex),
        cos: Math.abs(dx * -ey + dy * ex) / len,
      };
      return insideWalls({ x: hit.x + dx * 2, y: hit.y + dy * 2 }, level.walls) ? hit : null;
    }
  }
  return null;
};

// Where the beam's centre hits a wall, the wall's art shows through in a soft spot, glowing close up.
// It's the beam's footprint (at least HOTSPOT_MIN_RADIUS), stretched along a slanted wall, fading
// with distance, and trimmed to the walls.
const HOTSPOT_MIN_RADIUS = 0.4 * GRID_SIZE;
const HOTSPOT_BRIGHTNESS = 0.6; // how much of the wall shows at the spot's centre, close up
const HOTSPOT_GLOW = 0.8;
const HOTSPOT_MAX_STRETCH = 2;
const hotspotRadius = (dist: number) => Math.max(HOTSPOT_MIN_RADIUS, dist * Math.tan(FLASHLIGHT.cone / 2));
const hotspotStretch = (cos: number) => Math.min(HOTSPOT_MAX_STRETCH, 1 / Math.max(cos, 1e-3));

// How far a group's hotspot reaches (0 if none), for its bounds.
export const hotspotReach = (group: LightGroup) => {
  const hit = beamWallHit(group);
  return hit ? hotspotRadius(hit.dist) * hotspotStretch(hit.cos) : 0;
};

const hotspotLayer = document.createElement('canvas');
const hotspotCtx = hotspotLayer.getContext('2d')!;
// Into the light map `c` and the glow map `glow`. True if it drew anything.
export const drawBeamHotspot = (c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, group: LightGroup) => {
  const hit = beamWallHit(group);
  if (!hit) return false;
  const near = Math.max(0, 1 - hit.dist / FLASHLIGHT.range);
  const alpha = HOTSPOT_BRIGHTNESS * near;
  if (alpha <= 0) return false;
  const r = hotspotRadius(hit.dist);
  const stretch = hotspotStretch(hit.cos);

  // The spot's soft shape, filled with the wall art lined up with the world.
  const ext = Math.ceil(r * stretch);
  const ox = Math.floor(hit.x) - ext;
  const oy = Math.floor(hit.y) - ext;
  const h = hotspotCtx;
  hotspotLayer.width = hotspotLayer.height = ext * 2;
  h.save();
  h.translate(hit.x - ox, hit.y - oy);
  h.rotate(hit.faceAngle);
  h.scale(stretch, 1);
  const shape = h.createRadialGradient(0, 0, 0, 0, 0, r);
  shape.addColorStop(0, `rgba(0, 0, 0, ${alpha.toFixed(3)})`);
  shape.addColorStop(1, 'rgba(0, 0, 0, 0)');
  h.fillStyle = shape;
  h.fillRect(-r, -r, r * 2, r * 2);
  h.restore();
  const art = h.createPattern(wallArt, 'no-repeat')!;
  art.setTransform(new DOMMatrix([1, 0, 0, 1, -ox, -oy]));
  h.globalCompositeOperation = 'source-in';
  h.fillStyle = art;
  h.fillRect(0, 0, ext * 2, ext * 2);

  // Trimmed with the wall mask (cheaper on a phone than clipping to every wall).
  h.globalCompositeOperation = 'destination-in';
  h.drawImage(wallMask, ox, oy, ext * 2, ext * 2, 0, 0, ext * 2, ext * 2);
  c.drawImage(hotspotLayer, ox, oy); // (only its alpha counts, in the light map)
  glow.globalAlpha = HOTSPOT_GLOW * near ** 3;
  glow.drawImage(hotspotLayer, ox, oy);
  glow.globalAlpha = 1;
  return true;
};
