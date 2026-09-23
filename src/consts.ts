import type { Level, Mirror, Wall } from "./interfaces";

export const MOVE_COOLDOWN = 150; // ms between grid steps, prevents instant multi-tile jumps
export const GRID_SIZE = 50;
export const MOVE_SPEED = 8; // higher = snappier interpolation, lower = more floaty

// 1 grid cell = 3ft (a Medium creature's rough footprint), so 1ft ≈ 16.67px.
export const FEET_PER_GRID = 3;
export const PX_PER_FOOT = GRID_SIZE / FEET_PER_GRID;

// Candle: real candlelight is only genuinely useful for a few feet, with a much dimmer
// "can tell something's there" fringe beyond that — 10ft total keeps it feeling appropriately
// intimate rather than lantern-bright.
export const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT); // 10ft
// Flashlight: a modest handheld beam throws usable light 40-50ft in a straight line; narrow
// cone width is a deliberate gameplay choice, not a real-flashlight number.
export const FLASHLIGHT_RANGE = Math.round(45 * PX_PER_FOOT); // 45ft
export const FLASHLIGHT_CONE_DEGREES = 20; // total width, not half-angle
// Purely visual: how far light shows into a wall face it hits. Movement and shadows ignore it.
export const WALL_LIGHT_PENETRATION = 4;
export const LIGHT_IGNITE_MS = 2000; // on level start, the light grows from nothing to full radius over this long
export const MAX_MIRROR_BOUNCES = 3; // backstop against runaway recursion between facing mirrors

// Fog-of-war memory is stored at this fraction of screen resolution and upscaled with bilinear
// smoothing, which softens its edges (lower = softer and cheaper, but blurrier shadow lines).
export const FOG_MEMORY_SCALE = 0.35;
// Shape of the fog memory's fade across the light's radius: higher holds full memory further out
// before fading (2 = fades from the centre, 4 = ~half strength at 70% of radius, 8 = later still).
export const FOG_FALLOFF_SHOULDER = 3;

export const TARGET_FPS = 60;

// Ray budget. Base rays are spread evenly across the light's arc; wherever two neighbours disagree
// on what they hit (a shadow edge, a mirror edge — at any bounce depth), the gap between them is
// bisected up to RAY_REFINE_DEPTH times. So rays concentrate only where edges actually are, and
// flat open areas stay cheap. Base spacing still bounds the thinnest object that can't be missed
// entirely: ~8.7px at the candle's edge, ~11px at the flashlight's full range.
export const CANDLE_RAY_COUNT = 120;
export const FLASHLIGHT_RAY_COUNT = 24;
export const RAY_REFINE_DEPTH = 5;
export const MAX_TRACED_RAYS = 2048; // hard ceiling per frame, refinement stops once reached

export const keysDown = new Set<string>();
export const player = {
  gridX: 0,   // logical grid position (integer cells), set by loadLevel
  gridY: 0,
  visualX: 0, // pixel position, smoothly follows gridX/gridY
  visualY: 0,
  facingAngle: Math.PI / 2, // radians; updated on movement input, drives the flashlight cone
};
export const lightState: { mode: 'candle' | 'flashlight' } = { mode: 'candle' };
// `startedAt` is on the performance.now() / requestAnimationFrame clock.
export const gameState: { status: 'playing' | 'won'; startedAt: number } = { status: 'playing', startedAt: 0 };

// Active level geometry and rules. `let` exports are live bindings, so every module importing
// these sees the new values after loadLevel reassigns them.
export let walls: Wall[] = [];
export let mirrors: Mirror[] = [];
export let start = { gridX: 0, gridY: 0 };
export let goal = { gridX: 0, gridY: 0 };
export let allowFlashlight = false;

export const loadLevel = (level: Level) => {
  walls = level.walls;
  mirrors = level.mirrors;
  start = level.start;
  goal = level.goal;
  allowFlashlight = level.allowFlashlight;
  player.gridX = level.start.gridX;
  player.gridY = level.start.gridY;
  player.visualX = player.gridX * GRID_SIZE + GRID_SIZE / 2;
  player.visualY = player.gridY * GRID_SIZE + GRID_SIZE / 2;
  player.facingAngle = Math.PI / 2;
  lightState.mode = 'candle';
  gameState.status = 'playing';
  gameState.startedAt = performance.now();
}


