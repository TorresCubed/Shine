import type { Wall } from '../core/types';
import { GRID_SIZE, DUST } from '../core/consts';
import { level, shines } from '../core/state';
import { doorLeaves } from '../core/util';
import { pixelRatio, worldCanvas } from './canvases';
import { frameTime } from './frame';
import { leafQuad, quadsPath } from './geometry';
import type { Bounds } from './geometry';
import { screenView } from './camera';

// Drawing-only touches that make the world react.

// A locked door that unlocks (or re-locks) flashes green (or red), even in fog, so you know your light
// reached its plate, but only once you've seen the door.
const LOCK_FLASH_MS = 900;
export const drawLockFlashes = (c: CanvasRenderingContext2D) => {
  for (const door of level.doors) {
    const t = (frameTime - door.lockFlashAt) / LOCK_FLASH_MS;
    if (door.kind !== 'locked' || !door.everSeen || t < 0 || t >= 1) continue;
    const color = door.triggerOn || door.opened ? '#7dff5a' : '#ff4a3a';
    c.save();
    c.globalAlpha = Math.sin(Math.PI * Math.sqrt(t)); // quick to flare, slower to fade
    c.fillStyle = c.shadowColor = color;
    c.shadowBlur = 0.4 * GRID_SIZE;
    c.beginPath();
    quadsPath(c, doorLeaves(door, door.seenOpenAmount).map(leafQuad));
    c.fill();
    c.restore();
  }
};

// A shine where a light was picked up or dropped: a glow and a four-point glint, flaring and fading
// over SHINE_MS. Never under SHINE_MIN_CSS_PX on screen.
const CANDLE_GLOW_RGB = '255, 220, 150';
const SHINE_MS = 750;
const SHINE_SIZE = 0.2; // cells, the long rays' length at their longest
const SHINE_MIN_CSS_PX = 20;
export const drawShines = (c: CanvasRenderingContext2D) => {
  for (let i = shines.length - 1; i >= 0; i--) if (frameTime - shines[i].at >= SHINE_MS) shines.splice(i, 1);
  const size = Math.max(SHINE_SIZE * GRID_SIZE, (SHINE_MIN_CSS_PX * pixelRatio) / screenView.zoom);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const s of shines) {
    const t = Math.max(0, (frameTime - s.at) / SHINE_MS);
    const strength = Math.sin(Math.PI * Math.sqrt(t)); // flares quickly, fades slower
    const glow = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, size * (0.4 + 0.4 * t));
    glow.addColorStop(0, `rgba(${CANDLE_GLOW_RGB}, ${0.55 * strength})`);
    glow.addColorStop(1, `rgba(${CANDLE_GLOW_RGB}, 0)`);
    c.fillStyle = glow;
    c.fillRect(s.x - size, s.y - size, size * 2, size * 2);

    c.translate(s.x, s.y);
    c.rotate((t * Math.PI) / 2);
    c.fillStyle = `rgba(${CANDLE_GLOW_RGB}, ${0.6 * strength})`;
    const ray = (angle: number, len: number, width: number) => {
      c.save();
      c.rotate(angle);
      c.beginPath();
      c.moveTo(0, -width);
      c.lineTo(len, 0);
      c.lineTo(0, width);
      c.lineTo(-len, 0);
      c.closePath();
      c.fill();
      c.restore();
    };
    const len = size * strength;
    const width = size * 0.07;
    ray(0, len, width);
    ray(Math.PI / 2, len, width);
    ray(Math.PI / 4, len * 0.45, width * 0.8);
    ray(-Math.PI / 4, len * 0.45, width * 0.8);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  c.restore();
};

// Dust: motes drifting across the level, drawn 'source-atop' the lit area so they only show in light.
type Mote = { x: number; y: number; heading: number; speed: number; phase: number };
let dust: Mote[] = [];
let dustFor: Wall[] | null = null;
export const updateDust = (dt: number) => {
  const w = worldCanvas.width;
  const h = worldCanvas.height;
  if (dustFor !== level.walls) {
    dustFor = level.walls;
    dust = Array.from({ length: Math.round(((w * h) / (GRID_SIZE * GRID_SIZE)) * DUST.perCell) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      heading: Math.random() * Math.PI * 2,
      speed: DUST.speed * (0.5 + Math.random()),
      phase: Math.random() * Math.PI * 2,
    }));
  }
  for (const m of dust) {
    m.heading += (Math.random() - 0.5) * 2 * dt; // a slow random wander
    m.x = (m.x + Math.cos(m.heading) * m.speed * dt + w) % w;
    m.y = (m.y + Math.sin(m.heading) * m.speed * dt + h) % h;
  }
};
export const drawDust = (c: CanvasRenderingContext2D, b: Bounds) => {
  for (const m of dust) {
    if (m.x < b.x || m.y < b.y || m.x > b.x + b.w || m.y > b.y + b.h) continue;
    const twinkle = 0.5 + 0.5 * Math.sin((frameTime / DUST.twinkleMs) * Math.PI * 2 + m.phase);
    c.fillStyle = `rgba(255, 240, 210, ${(DUST.brightness * twinkle).toFixed(3)})`;
    c.fillRect(Math.round(m.x), Math.round(m.y), DUST.size, DUST.size); // whole pixels, like the art
  }
};
