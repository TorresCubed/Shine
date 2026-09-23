import type { Mirror } from "./interfaces";

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
export const MAX_MIRROR_BOUNCES = 3; // backstop against runaway recursion between facing mirrors

export const TARGET_FPS = 30; // capped low for now to get a baseline on the ray tracer's cost

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
  gridX: 8,   // logical grid position (integer cells)
  gridY: 7,
  visualX: 0, // pixel position, smoothly follows gridX/gridY
  visualY: 0,
  facingAngle: Math.PI / 2, // radians; updated on movement input, drives the flashlight cone
};
export const lightState: { mode: 'candle' | 'flashlight' } = { mode: 'candle' };
export const walls = [
  { x: 400, y: 300, w: 150, h: 40 },
  { x: 200, y: 450, w: 40, h: 200 },
  { x: 600, y: 150, w: 40, h: 300 },
];
export const mirrors: Mirror[] = [
  { x1: 500, y1: 500, x2: 560, y2: 460 }, // original
  // Facing pair 1: both vertical, normals pointing straight at each other. Moved to y:520-580
  // (below wall3's y<=450 and the original mirror's y<=500) so the line between them is clear.
  { x1: 700, y1: 520, x2: 700, y2: 580 }, // right side
  { x1: 340, y1: 520, x2: 340, y2: 580 }, // left side
  // Facing pair 2: same idea as pair 1 but on the other axis — both horizontal, same x-range,
  // stacked 100px apart so their normals point straight up/down at each other. A well clear area
  // (y:750-850), away from every wall and the other mirrors.
  { x1: 500, y1: 750, x2: 560, y2: 750 }, // top
  { x1: 500, y1: 850, x2: 560, y2: 850 }, // bottom
];


