import { polygonsPath, cellCenter } from "../core/util";
import { insideAny, brightnessAt } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import type { GridPos, Point } from "../core/types";
import { GRID_SIZE, FOG, DOOR } from "../core/consts";
import { doors, doorLeaves, mirrors, levers } from "../core/state";
import type { DoorState } from "../core/state";
import { exploredCanvas, exploredCtx, recentCanvas, recentCtx } from "./canvases";
import { quadsPath } from "./geometry";
import { facesOf } from "./faces";
import { mirrorSeen } from "./sight";

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

// Writes the light in the player's line of sight into fog memory, with the same falloff as the light
// itself, so a spot is remembered only as well as it was seen. Brightness lives in the RGB of an
// opaque canvas because 'lighten' is then an exact per-pixel max (alpha would accumulate instead).
// (Into both memories: the one that keeps, and the one that fades, which is inverted, so there it's
// an exact per-pixel min, 'darken', of the inverted falloff.)
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
}

// Memory fades while out of sight: the recent memory drops steadily, from full to nothing in exactly
// FOG.fadeS (whatever's in sight is written back at full each frame, so only what's out of sight
// fades). The mask is 8-bit, and scaling it down (a 'multiply') rounds a dim spot's small drop away,
// so it would never fade out; so the recent memory is kept inverted (white = forgotten), and fading
// is adding ('lighter') whole steps as they add up, which is exact and stops at white. All on the
// GPU: no reading pixels back.
let fadeOwed = 0; // how much the memory should have dropped that hasn't yet (0-255 scale)
export const fadeMemory = (dt: number) => {
  fadeOwed += 255 * dt / FOG.fadeS;
  const drop = Math.min(255, Math.floor(fadeOwed));
  if (drop < 1) return;
  fadeOwed -= drop;
  recentCtx.globalCompositeOperation = 'lighter';
  recentCtx.fillStyle = `rgb(${drop},${drop},${drop})`;
  recentCtx.fillRect(0, 0, recentCanvas.width, recentCanvas.height);
  recentCtx.globalCompositeOperation = 'source-over';
}

// Objects are remembered whole, not just the parts your light touched: when one is seen, or one
// you've seen does something (a door swings, locks or unlocks; a mirror turns; a lever is pulled),
// the memory under all of it is set back to full, so it shows complete and starts fading afresh.
// Plates count as seen when their centre is lit and in sight, levers too (or when pulled).
// `level` (0-1) is how well: full unless given.
const rememberWhole = (shape: (c: CanvasRenderingContext2D) => void, level = 1) => {
  const v = Math.round(255 * level);
  for (const c of [exploredCtx, recentCtx]) {
    const inverted = c === recentCtx, shade = inverted ? 255 - v : v;
    c.save();
    c.setTransform(FOG.memoryScale, 0, 0, FOG.memoryScale, 0, 0);
    c.globalCompositeOperation = inverted ? 'darken' : 'lighten';
    c.fillStyle = c.strokeStyle = `rgb(${shade},${shade},${shade})`;
    shape(c);
    c.restore();
  }
}
const cellShape = (g: GridPos) => (c: CanvasRenderingContext2D) => c.fillRect(g.gridX * GRID_SIZE, g.gridY * GRID_SIZE, GRID_SIZE, GRID_SIZE);
const rememberObjects = (groups: LightGroup[], view: Point[][]) => {
  const seen = (g: GridPos) => { const p = cellCenter(g); return insideAny(p, view) && brightnessAt(p, groups) > 0; };
  for (const m of mirrors) if (m.everSeen && (m.turnLeft > 0 || mirrorSeen(m, groups, view))) rememberWhole(cellShape(m));
  for (const l of levers) {
    if (l.pulled || seen(l)) rememberWhole(cellShape(l));
    l.pulled = false;
  }
  for (const door of doors) {
    if (door.kind !== 'lever' && seen(door.trigger)) rememberWhole(cellShape(door.trigger));
    if (!door.showWhole) continue;
    const level = doorMemoryLevel(door, groups);
    rememberWhole(c => {
      c.lineWidth = DOOR.artWidth + 8; // a little over, as the low-res memory's edges are soft
      c.beginPath();
      for (const s of doorLeaves(door, door.seenOpenAmount)) { c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); }
      c.stroke();
    }, level);
  }
}
// A door is remembered whole, but only as well as the floor beside it: the memory falloff
// (FOG_MEMORY_STOPS) of the brightest light just off either face of its leaves. Out of light (a door
// you've seen swinging in the dark), as well as when you last saw it. (Remembered at full, a dimly
// lit door's fog copy showed through its light far brighter than the dim floor and walls around it.)
const doorMemory = new WeakMap<DoorState, number>();
const doorMemoryLevel = (door: DoorState, groups: LightGroup[]) => {
  let best = -1;
  for (const s of doorLeaves(door, door.openAmount)) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, off = DOOR.artWidth / 2 + 2;
    const nx = -(s.y2 - s.y1) / len * off, ny = (s.x2 - s.x1) / len * off;
    for (const f of [0.1, 0.5, 0.9]) for (const side of [1, -1]) {
      const p = { x: s.x1 + (s.x2 - s.x1) * f + nx * side, y: s.y1 + (s.y2 - s.y1) * f + ny * side };
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
}

// Fog memory is written (and its mask rebuilt) every MEMORY_EVERY frames: fog only changes as
// things fade, and what's lit is drawn fresh over it every frame anyway. `write` false skips the
// writing (?skip=memory) but keeps the mask's rhythm.
const MEMORY_EVERY = 2;
let memoryFrames = 0, memoryMaskStale = true;
export const rememberSeen = (groups: LightGroup[], view: Point[][], write: boolean) => {
  if (memoryFrames++ % MEMORY_EVERY !== 0) return;
  memoryMaskStale = true;
  if (!write) return;
  rememberLight(groups, view);
  rememberObjects(groups, view);
}

// Everything remembered, as the playtest's fog view shows it.
export const rememberEverything = () => {
  for (const c of [exploredCtx, recentCtx]) {
    c.fillStyle = c === recentCtx ? '#000' : '#fff'; // everything remembered (the recent memory is inverted)
    c.fillRect(0, 0, exploredCanvas.width, exploredCanvas.height);
  }
}

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
  const m = memoryMaskCtx, w = memoryMask.width, h = memoryMask.height;
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
}
