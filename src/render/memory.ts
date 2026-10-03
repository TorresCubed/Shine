import { cellCenter, doorLeaves, normalOf, polygonsPath } from '../core/util';
import { insideAny, brightnessAt } from '../light/rayTracer';
import type { LightGroup } from '../light/rayTracer';
import type { DoorState, GridPos, Point } from '../core/types';
import { GRID_SIZE, FOG, DOOR } from '../core/consts';
import { level } from '../core/state';
import { exploredCanvas, exploredCtx, recentCanvas, recentCtx } from './canvases';
import { quadsPath } from './geometry';
import { facesOf } from './faces';
import { mirrorSeen } from './sight';

// Memory strength vs. fraction of the light's radius: (1 - t^k)^2, sampled as gradient stops.
const FOG_MEMORY_STOPS: [number, string][] = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const v = Math.round(255 * (1 - t ** FOG.falloffShoulder) ** 2);
  return [t, `rgb(${v},${v},${v})`];
});
// The same, inverted, for the recent memory (which is kept inverted: see fadeMemory).
const FOG_FADE_STOPS: [number, string][] = FOG_MEMORY_STOPS.map(([t, color]) => {
  const v = 255 - Number(color.slice(4, color.indexOf(',')));
  return [t, `rgb(${v},${v},${v})`];
});

// Writes the light in line of sight into both memories, with the light's own falloff, so a spot is
// remembered only as well as it was seen. Brightness is in an opaque canvas's RGB, so 'lighten' is an
// exact per-pixel max ('darken', a min, in the inverted recent memory).
const rememberLight = (groups: LightGroup[], view: Point[][]) => {
  for (const c of [exploredCtx, recentCtx]) {
    const inverted = c === recentCtx;
    c.save();
    c.setTransform(FOG.memoryScale, 0, 0, FOG.memoryScale, 0, 0);
    polygonsPath(c, view);
    c.clip();
    c.globalCompositeOperation = inverted ? 'darken' : 'lighten';
    for (const g of groups) {
      const gradient = c.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, g.radius);
      for (const [t, color] of inverted ? FOG_FADE_STOPS : FOG_MEMORY_STOPS) gradient.addColorStop(t, color);
      c.fillStyle = gradient;
      polygonsPath(c, g.polys);
      c.fill();
      // Its lit wall and door faces (a fill of their own: a quad wound against the light's outline
      // would cancel it out where they overlap).
      c.beginPath();
      for (const quads of facesOf(g)) quadsPath(c, quads);
      c.fill();
    }
    c.restore();
  }
};

// The recent memory fades from full to nothing over FOG.fadeS (what's in sight is rewritten each
// frame). Multiplying an 8-bit mask down rounds small drops away, so it's kept inverted (white =
// forgotten) and fades by adding whole steps ('lighter'): exact, and all on the GPU.
let fadeOwed = 0; // how much the memory should have dropped that hasn't yet (0-255 scale)
export const fadeMemory = (dt: number) => {
  fadeOwed += (255 * dt) / FOG.fadeS;
  const drop = Math.min(255, Math.floor(fadeOwed));
  if (drop < 1) return;
  fadeOwed -= drop;
  recentCtx.globalCompositeOperation = 'lighter';
  recentCtx.fillStyle = `rgb(${drop},${drop},${drop})`;
  recentCtx.fillRect(0, 0, recentCanvas.width, recentCanvas.height);
  recentCtx.globalCompositeOperation = 'source-over';
};

// Objects are remembered whole: when one is seen, or one you've seen does something (a door swings
// or locks, a mirror turns, a lever is pulled), the memory under all of it is set to `strength` (full
// unless given), so it shows complete and starts fading afresh.
const rememberWhole = (shape: (c: CanvasRenderingContext2D) => void, strength = 1) => {
  const v = Math.round(255 * strength);
  for (const c of [exploredCtx, recentCtx]) {
    const inverted = c === recentCtx;
    const shade = inverted ? 255 - v : v;
    c.save();
    c.setTransform(FOG.memoryScale, 0, 0, FOG.memoryScale, 0, 0);
    c.globalCompositeOperation = inverted ? 'darken' : 'lighten';
    c.fillStyle = c.strokeStyle = `rgb(${shade},${shade},${shade})`;
    shape(c);
    c.restore();
  }
};
const cellShape = (g: GridPos) => (c: CanvasRenderingContext2D) =>
  c.fillRect(g.gridX * GRID_SIZE, g.gridY * GRID_SIZE, GRID_SIZE, GRID_SIZE);
const rememberObjects = (groups: LightGroup[], view: Point[][]) => {
  const seen = (g: GridPos) => {
    const p = cellCenter(g);
    return insideAny(p, view) && brightnessAt(p, groups) > 0;
  };
  for (const m of level.mirrors)
    if (m.everSeen && (m.turnLeft > 0 || mirrorSeen(m, groups, view))) rememberWhole(cellShape(m));
  for (const l of level.levers) {
    if (l.pulled || seen(l)) rememberWhole(cellShape(l));
    l.pulled = false;
  }
  for (const door of level.doors) {
    if (door.kind !== 'lever' && seen(door.trigger)) rememberWhole(cellShape(door.trigger));
    if (!door.showWhole) continue;
    const strength = doorMemoryLevel(door, groups);
    rememberWhole(c => {
      c.lineWidth = DOOR.artWidth + 8; // a little over, as the low-res memory's edges are soft
      c.beginPath();
      for (const s of doorLeaves(door, door.seenOpenAmount)) {
        c.moveTo(s.x1, s.y1);
        c.lineTo(s.x2, s.y2);
      }
      c.stroke();
    }, strength);
  }
};
// How well a door is remembered: as well as the floor beside it (the memory falloff of the brightest
// light just off its leaves), or out of light, as well as when last lit. At full, a dimly lit door's
// fog copy showed far brighter than the floor around it.
const doorMemory = new WeakMap<DoorState, number>();
const doorMemoryLevel = (door: DoorState, groups: LightGroup[]) => {
  let best = -1;
  for (const s of doorLeaves(door, door.openAmount)) {
    const n = normalOf(s, DOOR.artWidth / 2 + 2);
    for (const f of [0.1, 0.5, 0.9])
      for (const side of [1, -1]) {
        const p = { x: s.x1 + (s.x2 - s.x1) * f + n.x * side, y: s.y1 + (s.y2 - s.y1) * f + n.y * side };
        for (const g of groups) {
          const dist = Math.hypot(p.x - g.origin.x, p.y - g.origin.y);
          if (dist >= g.radius || !insideAny(p, g.polys)) continue; // (out of reach first: it's cheap)
          const t = dist / g.radius;
          best = Math.max(best, (1 - t ** FOG.falloffShoulder) ** 2);
        }
      }
  }
  if (best >= 0) doorMemory.set(door, best);
  return doorMemory.get(door) ?? 1;
};

// Fog memory is written (and its mask rebuilt) every MEMORY_EVERY frames: fog only changes as
// things fade, and what's lit is drawn fresh over it every frame anyway. `write` false skips the
// writing (?skip=memory) but keeps the mask's rhythm.
const MEMORY_EVERY = 2;
let memoryFrames = 0;
let memoryMaskStale = true;
export const rememberSeen = (groups: LightGroup[], view: Point[][], write: boolean) => {
  if (memoryFrames++ % MEMORY_EVERY !== 0) return;
  memoryMaskStale = true;
  if (!write) return;
  rememberLight(groups, view);
  rememberObjects(groups, view);
};

// Everything remembered, as the playtest's fog view shows it.
export const rememberEverything = () => {
  for (const c of [exploredCtx, recentCtx]) {
    c.fillStyle = c === recentCtx ? '#000' : '#fff'; // everything remembered (the recent memory is inverted)
    c.fillRect(0, 0, exploredCanvas.width, exploredCanvas.height);
  }
};

// What fog shows of each spot: FOG.fadeMin of how well it was ever seen, and the rest of how
// recently, so remembered things fade after you leave but never all the way. Rebuilt only when the
// memory's been written since, or the level's changed size.
const memoryMask = document.createElement('canvas');
const memoryMaskCtx = memoryMask.getContext('2d')!;
export const getMemoryMask = () => {
  const resized = memoryMask.width !== exploredCanvas.width || memoryMask.height !== exploredCanvas.height;
  if (!memoryMaskStale && !resized) return memoryMask;
  memoryMaskStale = false;
  // (Resized only when the level changes: resizing a canvas reallocates it.)
  if (resized) {
    memoryMask.width = exploredCanvas.width;
    memoryMask.height = exploredCanvas.height;
  }
  const m = memoryMaskCtx;
  const w = memoryMask.width;
  const h = memoryMask.height;
  // The recent memory, turned back the right way up: white 'difference' it = 1 - it.
  m.globalCompositeOperation = 'source-over';
  m.fillStyle = '#fff';
  m.fillRect(0, 0, w, h);
  m.globalCompositeOperation = 'difference';
  m.drawImage(recentCanvas, 0, 0);
  if (FOG.fadeMin > 0) {
    const k = Math.round(255 * (1 - FOG.fadeMin));
    m.globalCompositeOperation = 'multiply';
    m.fillStyle = `rgb(${k},${k},${k})`;
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = 'lighter';
    m.globalAlpha = FOG.fadeMin;
    m.drawImage(exploredCanvas, 0, 0);
    m.globalAlpha = 1;
  }
  m.globalCompositeOperation = 'source-over';
  return memoryMask;
};
