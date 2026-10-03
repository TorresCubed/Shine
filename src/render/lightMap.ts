import { polygonsPath } from '../core/util';
import { fadeProfile, fadeAt } from '../light/brightness';
import type { LightGroup, Penumbra } from '../light/rayTracer';
import { LIGHT, FLAME, RAYS, LIT_SURFACES } from '../core/consts';
import { worldCanvas, litCtx, regionCtx, fitToWorld } from './canvases';
import { frameTime } from './frame';
import { skip } from './debug';
import { copyRect } from './geometry';
import type { Bounds } from './geometry';
import { facesOf, drawFaceLight } from './faces';
import { drawBeamHotspot, hotspotReach } from './hotspot';

// How brightly lit walls glow: a beam strongly, a flame softly.
const WALL_GLOW_FLASHLIGHT = 0.5;
const WALL_GLOW_FLAME = 0.12;

// A group's bounding box, padded for its face band and hotspot, clamped to the world.
export const boundsOf = (group: LightGroup): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of group.polys)
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  const pad = Math.max(LIT_SURFACES.wallPenetration, hotspotReach(group));
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(worldCanvas.width, Math.ceil(maxX + pad));
  const bottom = Math.min(worldCanvas.height, Math.ceil(maxY + pad));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
};

// The light map: each light adds how strongly it lights each spot into litLayer's alpha ('lighter'):
// its polygons at LIT_SURFACES.floorStrength, its wall and door faces at full, all faded by its
// falloff, plus a flashlight's wall hotspot. draw then cuts it to the line of sight and lays the lit
// art in once for every light ('source-in'), far cheaper on a phone than a lit copy per light.
// A canvas can't store more than full, so light brighter than the art (wall glow, the hotspot) goes
// into a second map, glowLayer, laid in the same way and added on top.
export const glowLayer = document.createElement('canvas');
export const glowCtx = glowLayer.getContext('2d')!;

export const clearLightMaps = (b: Bounds) => {
  litCtx.clearRect(b.x, b.y, b.w, b.h);
  fitToWorld(glowLayer);
  glowCtx.clearRect(b.x, b.y, b.w, b.h);
};

// Fills a faded group (a beam, light off a mirror) onto `target`: its falloff on a scratch layer, then
// each fade as a conic gradient, since a canvas can't multiply two gradients in one fill.
const beamLayer = document.createElement('canvas');
const beamCtx = beamLayer.getContext('2d')!;
const BEAM_PROFILE_STEPS = 24;
const fillBeam = (target: CanvasRenderingContext2D, group: LightGroup, b: Bounds, fill: CanvasGradient) => {
  fitToWorld(beamLayer);
  const s = beamCtx;
  const { x, y } = group.origin;
  s.save();
  s.beginPath();
  s.rect(b.x, b.y, b.w, b.h);
  s.clip(); // (also keeps 'destination-in' below from clearing the whole canvas)
  s.clearRect(b.x, b.y, b.w, b.h);
  s.fillStyle = fill;
  polygonsPath(s, group.polys);
  s.fill();
  s.globalCompositeOperation = 'destination-in';
  for (const fade of group.fades ?? []) {
    const across = s.createConicGradient(fade.axis - fade.half, x, y);
    const width = Math.min(1 - 2e-4, (2 * fade.half) / (Math.PI * 2)); // its share of the full turn
    for (let i = 0; i <= BEAM_PROFILE_STEPS; i++) {
      const f = i / BEAM_PROFILE_STEPS;
      across.addColorStop(f * width, `rgba(0,0,0,${fadeProfile(Math.abs(2 * f - 1), fade.core)})`);
    }
    across.addColorStop(width + 1e-4, 'rgba(0,0,0,0)');
    s.fillStyle = across;
    s.fillRect(b.x, b.y, b.w, b.h);
  }
  s.restore();
  copyRect(target, beamLayer, b);
};
// A group's soft shadow edges, each fan fading out across its slices. Slices at the same step share a
// fill; a faded group dims each fan by its fade, rounded so fans still share fills.
const PENUMBRA_FADE_LEVELS = 4;
const drawPenumbras = (c: CanvasRenderingContext2D, group: LightGroup, paint: CanvasGradient) => {
  const fans = group.penumbras;
  if (!fans) return;
  const slices = (list: Penumbra[], j: number) => {
    c.beginPath();
    for (const { apex, ends } of list) {
      c.moveTo(apex.x, apex.y);
      c.lineTo(ends[j].x, ends[j].y);
      c.lineTo(ends[j + 1].x, ends[j + 1].y);
      c.closePath();
    }
  };
  const byFade = new Map<number, Penumbra[]>();
  for (const f of fans) {
    const level = group.fades?.length
      ? Math.round(fadeAt(f.apex, group) * PENUMBRA_FADE_LEVELS) / PENUMBRA_FADE_LEVELS
      : 1;
    if (level <= 0) continue;
    const list = byFade.get(level);
    if (list) list.push(f);
    else byFade.set(level, [f]);
  }
  c.fillStyle = paint;
  for (const [across, list] of byFade) {
    for (let j = 0; j < RAYS.softShadowSteps; j++) {
      const u = (j + 0.5) / RAYS.softShadowSteps;
      c.globalAlpha = across * (1 - u * u * (3 - 2 * u));
      slices(list, j);
      c.fill();
    }
  }
  c.globalAlpha = 1;
};

// One light into the light map (and glow map), within `b`. True if it put anything in the glow map.
export const drawLightMap = (group: LightGroup, b: Bounds) => {
  const c = litCtx;
  let glowed = false;
  for (const x of [c, glowCtx]) {
    x.save();
    x.beginPath();
    x.rect(b.x, b.y, b.w, b.h);
    x.clip();
    x.globalCompositeOperation = 'lighter';
  }
  // A flame's drawn reach and brightness dip as it flickers (drawn only).
  const dip = group.flame === undefined ? 0 : flicker(frameTime, group.flame);
  const reach = 1 - FLAME.flickerReach * dip;
  const bright = 1 - FLAME.flickerBrightness * dip;
  const { x, y } = group.origin;
  const falloff = (strength: number, on = c) => {
    const g = on.createRadialGradient(x, y, 0, x, y, group.radius * reach);
    for (const [t, v] of LIGHT.falloffStops) g.addColorStop(t, `rgba(255,255,255,${v * bright * strength})`);
    return g;
  };
  const strength = group.strength ?? 1;
  if (!group.fades?.length) {
    c.fillStyle = falloff(LIT_SURFACES.floorStrength * strength);
    polygonsPath(c, group.polys);
    c.fill();
  } else fillBeam(c, group, b, falloff(LIT_SURFACES.floorStrength * strength, beamCtx));
  if (!skip.has('soft')) drawPenumbras(c, group, falloff(LIT_SURFACES.floorStrength * strength));
  if (!skip.has('faces')) {
    const glow = group.spill ? 0 : group.beamAxis !== undefined ? WALL_GLOW_FLASHLIGHT : WALL_GLOW_FLAME;
    const faces = falloff(strength);
    const glowFaces = falloff(1, glowCtx);
    const bands = facesOf(group);
    drawFaceLight(c, bands, faces, v => 1 - 0.45 * (1 - v));
    drawFaceLight(glowCtx, bands, glowFaces, v => glow * v * v);
    glowed = glow > 0;
  }
  if (drawBeamHotspot(c, glowCtx, group)) glowed = true;
  c.restore();
  glowCtx.restore();
  return glowed;
};

// How far a flame has dipped at `ms` (0-1): eased random wobble plus two slow sines, so it never repeats.
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (t: number, seed: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i + seed * 57.3) * (1 - u) + hash(i + 1 + seed * 57.3) * u;
};
const flicker = (ms: number, seed: number) => {
  const t = ms / 1000;
  const wobble = noise(t * 5, seed) * 0.75 + noise(t * 10, seed + 11) * 0.25;
  const sway = 0.5 + 0.3 * Math.sin(t * 4.4 + seed) + 0.2 * Math.sin(t * 11.9 + seed * 2.3);
  return Math.min(1, Math.max(0, wobble * 0.65 + sway * 0.35));
};

// One light's reach as a flat tint, faded by its falloff, onto regionLayer (for the 'bright' view).
export const drawLightTint = (group: LightGroup, b: Bounds) => {
  const c = regionCtx;
  c.clearRect(b.x, b.y, b.w, b.h);
  c.fillStyle = group.beamAxis !== undefined ? 'rgb(90, 200, 255)' : 'rgb(255, 200, 90)';
  polygonsPath(c, group.polys);
  c.fill();
  c.globalCompositeOperation = 'destination-in';
  const { x, y } = group.origin;
  const falloff = c.createRadialGradient(x, y, 0, x, y, group.radius);
  for (const [t, v] of LIGHT.falloffStops) falloff.addColorStop(t, `rgba(255,255,255,${v})`);
  c.fillStyle = falloff;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.globalCompositeOperation = 'source-over';
};
