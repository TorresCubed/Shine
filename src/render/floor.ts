import { cellCenter, doorLeaves } from '../core/util';
import type { LeverState, Wall } from '../core/types';
import { GRID_SIZE, ANIMATION, LIT_SURFACES, MIRROR } from '../core/consts';
import { level, lightState } from '../core/state';
import { worldCanvas, fitToWorld } from './canvases';
import { frameTime } from './frame';
import { drawObject, floorTile, dimFloorTile } from './art';
import { ensureWallArt, wallArt, dimWallArt } from './walls';

// A lever pulled within the last ANIMATION.leverFlickMs is mid-flick.
const leverFlicking = (l: LeverState) => frameTime - l.pulledAt < ANIMATION.leverFlickMs;

// Everything on the floor (markers, lamps, plates, levers, unfound lights, mirrors), painted into both
// the lit and the remembered floor. `dim`: the fog palette, with mirrors as last seen.
const drawFloorMarks = (c: CanvasRenderingContext2D, dim: boolean, withDoors = true) => {
  c.lineWidth = 0.06 * GRID_SIZE;

  const s = cellCenter(level.start);
  const g = cellCenter(level.goal);
  drawObject(c, 'stairs', s.x, s.y, 0, dim);
  drawObject(c, 'stairsExit', g.x, g.y, 0, dim);

  // Wall lamps: a bar along the wall and a half-disc of glass.
  for (const l of level.lamps) {
    const p = cellCenter(l);
    const ex = p.x + (l.toWallX * GRID_SIZE) / 2;
    const ey = p.y + (l.toWallY * GRID_SIZE) / 2;
    const alongX = Math.abs(l.toWallY);
    const alongY = Math.abs(l.toWallX);
    const barHalf = GRID_SIZE * 0.25;
    const barDepth = 0.08 * GRID_SIZE;
    c.fillStyle = dim ? '#6a6a6a' : '#b08a4a';
    c.fillRect(
      Math.min(ex - alongX * barHalf, ex - l.toWallX * barDepth),
      Math.min(ey - alongY * barHalf, ey - l.toWallY * barDepth),
      alongX * barHalf * 2 + alongY * barDepth,
      alongY * barHalf * 2 + alongX * barDepth,
    );
    const facing = Math.atan2(-l.toWallY, -l.toWallX);
    c.fillStyle = dim ? '#8a8a8a' : '#ffd27a';
    c.beginPath();
    c.arc(ex, ey, GRID_SIZE * 0.16, facing - Math.PI / 2, facing + Math.PI / 2);
    c.closePath();
    c.fill();
  }

  // Unfound lights, only in fog here; lit, they're drawn on top (objects.ts).
  if (dim) for (const p of lightState.pickups) drawObject(c, 'flashlight', p.x, p.y, p.aimAngle, true);

  // Plates, dead. Awake, they're drawn over the dark (drawAwakePlates).
  for (const door of level.doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger);
    drawObject(c, 'plateDead', at.x, at.y, 0, dim);
  }

  // Levers: off, on, or mid-flick. One that turns mirrors is a wheel, turned as far as its (first) mirror.
  for (const l of level.levers) {
    const at = cellCenter(l);
    const turns = level.mirrors.find(m => m.control === l.id);
    if (turns) {
      drawObject(c, 'wheel', at.x, at.y, (turns.turned * Math.PI) / MIRROR.steps, dim); // upright to start
      continue;
    }
    const flicking = !dim && leverFlicking(l);
    drawObject(c, flicking ? 'leverMid' : l.on ? 'lever' : 'leverOff', at.x, at.y, 0, dim);
  }

  // Mirrors. Nothing shows which ones turn, or what turns them: you find out by trying.
  for (const m of level.mirrors) {
    const at = cellCenter(m);
    const step = dim ? m.seenStep : m.shownStep;
    drawObject(c, 'mirror', at.x, at.y, (step * Math.PI) / MIRROR.steps - Math.PI / 2, dim); // the art is upright
  }

  if (withDoors) drawDoors(c, dim);
};
// Each door's art along its leaves.
const drawDoors = (c: CanvasRenderingContext2D, dim: boolean) => {
  for (const door of level.doors) {
    for (const s of doorLeaves(door, dim ? door.seenOpenAmount : door.openAmount)) {
      drawObject(c, 'door', s.x1, s.y1, Math.atan2(s.y2 - s.y1, s.x2 - s.x1) - Math.PI / 2, dim);
    }
  }
};

// The remembered level, cached until its layout or anything seen changes (doors and mirrors as last
// seen, so fog never shows a change you didn't see). dimMarks is everything but the floorboards, all
// fog shows with the fog floor off (FOG.visibility 0); dimFloor is the floorboards with that on top.
export const dimMarksCanvas = document.createElement('canvas');
const dimMarksCtx = dimMarksCanvas.getContext('2d')!;
export const dimFloorCanvas = document.createElement('canvas');
const dimFloorCtx = dimFloorCanvas.getContext('2d')!;
let dimFloorKey = '';
export const ensureDimFloor = () => {
  ensureWallArt();
  const key = JSON.stringify([
    worldCanvas.width,
    worldCanvas.height,
    level.start,
    level.goal,
    level.walls,
    level.doors.map(d => d.seenOpenAmount),
    level.lamps,
    lightState.pickups,
    level.mirrors.map(m => [m.seenStep, Math.round(m.turned)]),
    level.levers.map(l => l.on),
  ]);
  if (key === dimFloorKey) return;
  dimFloorKey = key;
  dimMarksCanvas.width = dimFloorCanvas.width = worldCanvas.width;
  dimMarksCanvas.height = dimFloorCanvas.height = worldCanvas.height;
  drawFloorMarks(dimMarksCtx, true);
  dimMarksCtx.drawImage(dimWallArt, 0, 0);
  dimFloorCtx.fillStyle = dimFloorCtx.createPattern(dimFloorTile, 'repeat')!;
  dimFloorCtx.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  dimFloorCtx.drawImage(dimMarksCanvas, 0, 0);
};

// The lit art the light map reveals: floor, floor marks, a warm tint, walls and doors. Rebuilt only
// when something on it changes.
export const litArt = document.createElement('canvas');
const litArtCtx = litArt.getContext('2d')!;
let litArtKey = '';
let litArtWalls: Wall[] | null = null;
export const ensureLitArt = () => {
  ensureWallArt();
  const key = JSON.stringify([
    worldCanvas.width,
    worldCanvas.height,
    level.start,
    level.goal,
    level.lamps,
    level.doors.map(d => [d.openAmount, d.triggerOn, d.opened]),
    level.mirrors.map(m => m.shownStep),
    level.levers.map(l => [l.on, leverFlicking(l)]),
  ]);
  if (key === litArtKey && litArtWalls === level.walls) return;
  litArtKey = key;
  litArtWalls = level.walls;
  const c = litArtCtx;
  const w = worldCanvas.width;
  const h = worldCanvas.height;
  fitToWorld(litArt);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(0, 0, w, h);
  drawFloorMarks(c, false, false);
  // Warmed by multiplying (not adding) a warm colour, so the art keeps its contrast and darks.
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = LIT_SURFACES.floorTint;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  c.drawImage(wallArt, 0, 0);
  drawDoors(c, false);
};

// The 'bright' view: the whole level as if lit, with doors as they are.
export const drawBrightLevel = (c: CanvasRenderingContext2D) => {
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawFloorMarks(c, false);
  ensureWallArt();
  c.drawImage(wallArt, 0, 0);
};
