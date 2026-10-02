import { cellCenter } from "../core/util";
import type { GridPos, Wall } from "../core/types";
import { GRID_SIZE, ANIMATION, LIT_SURFACES, MIRROR } from "../core/consts";
import { levelWalls, doors, doorLeaves, lamps, mirrors, levers, lightState, start, goal, punches } from "../core/state";
import { worldCanvas, fitToWorld } from "./canvases";
import { frameTime } from "./frame";
import { drawObject, floorTile, dimFloorTile } from "./art";
import { ensureWallArt, wallArt, dimWallArt } from "./walls";

// A lever pulled within the last ANIMATION.leverFlickMs is mid-flick (its punch marks when it was pulled).
const leverFlicking = (l: GridPos) => frameTime - (punches.get(`lever ${l.gridX},${l.gridY}`) ?? -Infinity) < ANIMATION.leverFlickMs;

// Everything that belongs to the floor (markers, lamps, plates, levers, unfound lights, mirrors) is
// painted into both the lit and the remembered floor, so it's hidden in darkness and remembered in
// fog like the floor itself. `dim` picks the fog palette, and draws mirrors as last seen.
const drawFloorMarks = (c: CanvasRenderingContext2D, dim: boolean, withDoors = true) => {
  c.lineWidth = 0.06 * GRID_SIZE;

  // Stairs: the way in at the start, and the way on at the exit.
  const s = cellCenter(start), g = cellCenter(goal);
  drawObject(c, 'stairs', s.x, s.y, 0, dim);
  drawObject(c, 'stairsExit', g.x, g.y, 0, dim);

  // Wall lamps: a mounting bar along the wall edge with a half-disc of glass bulging into the room.
  for (const l of lamps) {
    const p = cellCenter(l);
    const ex = p.x + l.toWallX * GRID_SIZE / 2, ey = p.y + l.toWallY * GRID_SIZE / 2;
    const alongX = Math.abs(l.toWallY), alongY = Math.abs(l.toWallX);
    const barHalf = GRID_SIZE * 0.25, barDepth = 0.08 * GRID_SIZE;
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

  // Lights waiting to be found: only as remembered here; lit, they're drawn on top (see objects.ts).
  if (dim) for (const p of lightState.pickups) drawObject(c, 'flashlight', p.x, p.y, p.aimAngle, true);

  // Plates: dead, on the floor. Awake, they shine over the darkness (see drawAwakePlates).
  for (const door of doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger);
    drawObject(c, 'plateDead', at.x, at.y, 0, dim);
  }

  // Levers: off or on, flicking through mid as pulled. One that turns mirrors is a wheel, upright to
  // start and turned as far as the (first) mirror it turns has turned since, so it spins as that
  // does, pull after pull.
  for (const l of levers) {
    // (No pop when pulled: the flick, or the wheel turning, shows it.)
    const at = cellCenter(l), turns = mirrors.find(m => m.control === l.id);
    if (turns) {
      drawObject(c, 'wheel', at.x, at.y, turns.turned * Math.PI / MIRROR.steps, dim); // upright to start
      continue;
    }
    const flicking = !dim && leverFlicking(l);
    drawObject(c, flicking ? 'leverMid' : l.on ? 'lever' : 'leverOff', at.x, at.y, 0, dim);
  }

  // Mirrors. Nothing shows which ones turn, or what turns them: you find out by trying.
  for (const m of mirrors) {
    const at = cellCenter(m), step = dim ? m.seenStep : m.shownStep;
    drawObject(c, 'mirror', at.x, at.y, step * Math.PI / MIRROR.steps - Math.PI / 2, dim); // the art is upright
  }

  // Doors: each leaf where it is (as last seen, in fog).
  if (withDoors) drawDoors(c, dim);
}
// Every door's art, turned to lie along each leaf from its hinge.
const drawDoors = (c: CanvasRenderingContext2D, dim: boolean) => {
  for (const door of doors) {
    for (const s of doorLeaves(door, dim ? door.seenOpenAmount : door.openAmount)) {
      drawObject(c, 'door', s.x1, s.y1, Math.atan2(s.y2 - s.y1, s.x2 - s.x1) - Math.PI / 2, dim);
    }
  }
}

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
    worldCanvas.width, worldCanvas.height, start, goal, levelWalls, doors.map(d => d.seenOpenAmount), lamps,
    lightState.pickups, mirrors.map(m => [m.seenStep, Math.round(m.turned)]), levers.map(l => l.on),
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
}

// The lit art the light map reveals: the floor, floor marks and a warm glow, then the walls' and
// doors' own colours (only their lit faces show). Rebuilt only when something on it changes.
export const litArt = document.createElement('canvas');
const litArtCtx = litArt.getContext('2d')!;
let litArtKey = '';
let litArtWalls: Wall[] | null = null;
export const ensureLitArt = () => {
  ensureWallArt();
  const key = JSON.stringify([
    worldCanvas.width, worldCanvas.height, start, goal, lamps,
    doors.map(d => [d.openAmount, d.triggerOn, d.opened]), mirrors.map(m => m.shownStep),
    levers.map(l => [l.on, leverFlicking(l)]),
  ]);
  if (key === litArtKey && litArtWalls === levelWalls) return;
  litArtKey = key;
  litArtWalls = levelWalls;
  const c = litArtCtx, w = worldCanvas.width, h = worldCanvas.height;
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
}

// The 'bright' view: the whole level as if lit, with doors as they are.
export const drawBrightLevel = (c: CanvasRenderingContext2D) => {
  c.fillStyle = c.createPattern(floorTile, 'repeat')!;
  c.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  drawFloorMarks(c, false);
  ensureWallArt();
  c.drawImage(wallArt, 0, 0);
}
