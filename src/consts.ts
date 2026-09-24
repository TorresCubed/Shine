// Tuning values. Runtime state lives in state.ts.

export const GRID_SIZE = 50;
export const PLAYER_SPEED = 4 * GRID_SIZE;       // px per second
export const PLAYER_HALF_SIZE = 8; // collision footprint, px (drawn bigger)
export const PLAYER_DRAW_RADIUS = 10;
export const CORNER_ASSIST = 0.35 * GRID_SIZE;   // how far you're nudged sideways to line up with a gap
export const FEAR_REACH = 0.3 * GRID_SIZE;       // you count as lit if any point this close to you is

// 1 grid cell = 3ft, so 1ft ≈ 16.67px.
const PX_PER_FOOT = GRID_SIZE / 3;
export const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT);
export const LAMP_RADIUS = CANDLE_RADIUS + GRID_SIZE;
export const FLASHLIGHT_RANGE = Math.round(45 * PX_PER_FOOT);
export const FLASHLIGHT_CONE = 20 * Math.PI / 180; // total width
// While walking, the flashlight swings round to face where you're going at this rate.
export const FACING_TURN_DEG_PER_S = 1080;
// Standing still, Q/E aim it instead: slow at first for fine adjustment, ramping up while held.
export const FLASHLIGHT_TURN_MIN_DEG_PER_S = 30;
export const FLASHLIGHT_TURN_DEG_PER_S = 400;
export const FLASHLIGHT_TURN_RAMP_MS = 500;
export const LIGHT_IGNITE_MS = 2000; // lights grow to full radius over this long at level start

// Mirrors: a thin two-sided segment across the middle of their cell, turned in fixed steps.
export const MIRROR_HALF_LENGTH = 0.35 * GRID_SIZE; // short enough to stand in its cell beside it
export const MIRROR_THICKNESS = 4;
export const MIRROR_STEPS = 8; // orientations per half-turn (a mirror looks the same turned 180°)
export const MAX_MIRROR_BOUNCES = 3;

// Brightness vs. fraction of a light's radius, as [t, brightness] stops, linearly interpolated.
// Shared by the renderer and game logic, so "lit" in gameplay matches what's drawn.
export const LIGHT_FALLOFF_STOPS: [number, number][] = [[0, 1], [0.4, 0.9], [1, 0]];
export const LIT_THRESHOLD = 0.15;
export const DOOR_OPEN_MS = 1000;

export const WALL_LIGHT_PENETRATION = 4; // purely visual: how far light shows into a wall face

// Fog memory is stored at this fraction of the level's resolution; lower = softer edges.
export const FOG_MEMORY_SCALE = 0.25;
export const FOG_FLOOR_BRIGHTNESS = 0.45; // remembered floor vs. lit floor, after desaturating
// Shape of the memory's fade across a light's radius: (1 - t^k)^2, higher k holds full memory further out.
export const FOG_FALLOFF_SHOULDER = 3;

export const TARGET_FPS = 60;
export const CAMERA_MAX_ZOOM = 1.5; // the world is a scaled-up image, so further blurs

// Rays are spread evenly across a light's arc, then bisected up to RAY_REFINE_DEPTH times wherever
// neighbours hit different surfaces, so rays concentrate on edges.
export const CANDLE_RAY_COUNT = 120;
export const FLASHLIGHT_RAY_COUNT = 24;
export const RAY_REFINE_DEPTH = 5;
export const MAX_TRACED_RAYS = 2048;
