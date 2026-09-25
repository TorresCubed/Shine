// Tuning values. Runtime state lives in state.ts.

// Everything else is sized from this, so changing it scales the whole game without changing how any
// level plays. 64px suits common tile art sizes (16/32/64).
export const GRID_SIZE = 64;
export const PLAYER_SPEED = 4 * GRID_SIZE;          // px per second
export const PLAYER_HALF_SIZE = 0.16 * GRID_SIZE;   // collision footprint (drawn bigger)
// Player sprites (in src/assets), one per light in hand and one empty-handed, drawn facing right and
// rotated to face the aim. `anchor` is the pixel that sits on the player's position (the centre of the head); `light` is
// where the held light shines from: the flame, or the front centre of the flashlight's lens, which
// the beam fills (`lensHalfHeight`).
export const PLAYER_SPRITE_SCALE = 1;
export const PLAYER_SPRITES = {
  flashlight: { file: 'spriteFlashlight.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 53, y: 38 }, lensHalfHeight: 3 },
  candle: { file: 'spriteCandle.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 47.5, y: 36.5 } },
  empty: { file: 'sprite.png', anchor: { x: 33.5, y: 32.5 } },
};
export const CORNER_ASSIST = 0.35 * GRID_SIZE;   // how far you're nudged sideways to line up with a gap
export const FEAR_REACH = 0.3 * GRID_SIZE;       // you count as lit if any point this close to you is

// 1 grid cell = 3ft.
const PX_PER_FOOT = GRID_SIZE / 3;
export const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT);
export const LAMP_RADIUS = CANDLE_RADIUS + GRID_SIZE;
export const FLASHLIGHT_RANGE = Math.round(45 * PX_PER_FOOT);
export const FLASHLIGHT_CONE = 20 * Math.PI / 180; // total width
// While walking, the flashlight swings round to face where you're going at this rate.
export const FACING_TURN_DEG_PER_S = 1080;
// You only start walking once facing within this of the way you want to go. Not 0, so easing from
// straight to diagonal mid-walk barely hitches.
export const WALK_FACING_TOLERANCE_DEG = 30;
// Standing still, Q/E aim it instead: slow at first for fine adjustment, ramping up while held.
export const FLASHLIGHT_TURN_MIN_DEG_PER_S = 30;
export const FLASHLIGHT_TURN_DEG_PER_S = 400;
export const FLASHLIGHT_TURN_RAMP_MS = 500;
export const LIGHT_IGNITE_MS = 2000; // lights grow to full radius over this long at level start

// Mirrors: a thin two-sided segment across the middle of their cell, turned in fixed steps.
export const MIRROR_HALF_LENGTH = 0.35 * GRID_SIZE; // short enough to stand in its cell beside it
export const MIRROR_THICKNESS = 0.08 * GRID_SIZE;
export const MIRROR_STEPS = 8; // orientations per half-turn (a mirror looks the same turned 180°)
export const MIRROR_STEP_MS = 200; // how long a mirror takes to swing round one step
// Space turns a turnable mirror you're facing (within this angle) this close (centre to centre).
export const MIRROR_REACH = .93 * GRID_SIZE;
export const MIRROR_REACH_FACING_DEG = 50;
export const MAX_MIRROR_BOUNCES = 3;

// Brightness vs. fraction of a light's radius, as [t, brightness] stops, linearly interpolated.
// Shared by the renderer and game logic, so "lit" in gameplay matches what's drawn.
export const LIGHT_FALLOFF_STOPS: [number, number][] = [[0, 1], [0.4, 0.9], [1, 0]];
export const LIT_THRESHOLD = 0.15;
export const DOOR_OPEN_MS = 1000;

export const WALL_LIGHT_PENETRATION = 0.08 * GRID_SIZE; // purely visual: how far light shows into a wall face

// Fog memory is stored at this fraction of the level's resolution; lower = softer edges.
export const FOG_MEMORY_SCALE = 0.25;
export const FOG_FLOOR_BRIGHTNESS = 0.45; // remembered floor vs. lit floor, after desaturating
// Shape of the memory's fade across a light's radius: (1 - t^k)^2, higher k holds full memory further out.
export const FOG_FALLOFF_SHOULDER = 3;

export const TARGET_FPS = 60;
export const CAMERA_MAX_ZOOM = 3; // screen px per art px; zoom in is whole steps, so pixels stay crisp

// Rays are spread evenly across a light's arc, then bisected up to RAY_REFINE_DEPTH times wherever
// neighbours hit different surfaces, so rays concentrate on edges.
export const CANDLE_RAY_COUNT = 120;
export const FLASHLIGHT_RAY_COUNT = 24;
export const RAY_REFINE_DEPTH = 5;
export const MAX_TRACED_RAYS = 2048;
