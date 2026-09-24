import type { Door, GridPos, Lamp, Level, LightKind, Mirror, Pickup, Wall } from "./interfaces";

export const GRID_SIZE = 50;
export const PLAYER_SPEED = 4 * GRID_SIZE;       // px per second
export const PLAYER_HALF_SIZE = 0.2 * GRID_SIZE; // the player's square footprint for collision (drawn bigger)
// Walking into a wall, you're nudged sideways up to this far to line up with a gap beside you.
export const CORNER_ASSIST = 0.35 * GRID_SIZE;
// Fear rule leniency: you count as in the light if any point this close to your centre is lit.
export const FEAR_REACH = 0.3 * GRID_SIZE;

// 1 grid cell = 3ft (a Medium creature's rough footprint), so 1ft ≈ 16.67px.
export const FEET_PER_GRID = 3;
export const PX_PER_FOOT = GRID_SIZE / FEET_PER_GRID;

// Candle: real candlelight is only genuinely useful for a few feet, with a much dimmer
// "can tell something's there" fringe beyond that — 10ft total keeps it feeling appropriately
// intimate rather than lantern-bright.
export const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT); // 10ft
export const LAMP_RADIUS = CANDLE_RADIUS + GRID_SIZE; // wall lamps reach one cell further than a candle
// Flashlight: a modest handheld beam throws usable light 40-50ft in a straight line; narrow
// cone width is a deliberate gameplay choice, not a real-flashlight number.
export const FLASHLIGHT_RANGE = Math.round(45 * PX_PER_FOOT); // 45ft
export const FLASHLIGHT_CONE_DEGREES = 20; // total width, not half-angle
// Q/E aiming starts slow for fine adjustment and ramps up to full speed the longer it's held.
export const FLASHLIGHT_TURN_MIN_DEG_PER_S = 15;
export const FLASHLIGHT_TURN_DEG_PER_S = 180;
export const FLASHLIGHT_TURN_RAMP_MS = 800;
// Purely visual: how far light shows into a wall face it hits. Movement and shadows ignore it.
export const WALL_LIGHT_PENETRATION = 4;
export const LIGHT_IGNITE_MS = 2000; // on level start, the light grows from nothing to full radius over this long
export const MAX_MIRROR_BOUNCES = 3; // backstop against runaway recursion between facing mirrors

// Light brightness vs. fraction of the light's radius, as [t, brightness] stops, linearly
// interpolated. Shared by the renderer's falloff gradient and game logic, so "lit" in gameplay
// matches what's drawn.
export const LIGHT_FALLOFF_STOPS: [number, number][] = [[0, 1], [0.4, 0.9], [1, 0]];
export const LIT_THRESHOLD = 0.15; // brightness at a cell's centre for it to count as lit
export const DOOR_OPEN_MS = 1000;  // time for a door to slide fully open (or shut)

// Fog-of-war memory is stored at this fraction of screen resolution and upscaled with bilinear
// smoothing, which softens its edges (lower = softer and cheaper, but blurrier shadow lines).
export const FOG_MEMORY_SCALE = 0.25;
// Brightness of the remembered (fog of war) floor relative to the lit floor, after desaturating.
export const FOG_FLOOR_BRIGHTNESS = 0.45;
// Shape of the fog memory's fade across the light's radius: higher holds full memory further out
// before fading (2 = fades from the centre, 4 = ~half strength at 70% of radius, 8 = later still).
export const FOG_FALLOFF_SHOULDER = 3;

export const TARGET_FPS = 60;

// The camera follows the player; zoom is screen px per world px (mouse wheel or +/-). Zooming in
// stops at CAMERA_MAX_ZOOM (the world is a scaled-up image, so further blurs); zooming out stops
// where the whole level fits on screen.
export const CAMERA_MAX_ZOOM = 1.5;
export const camera = { zoom: 1 };

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
  x: 0,     // pixel position of the player's centre; moves freely
  y: 0,
  gridX: 0, // the cell the centre is in: what interactions (plates, pickups, the exit) use
  gridY: 0,
  aimAngle: Math.PI / 2, // radians; flashlight aim, turned with Q/E independently of movement
};
export interface DroppedLight extends GridPos { kind: LightKind; aimAngle: number; }
// held:    the light in hand, lit. At most one.
// stowed:  lights carried but switched off (F swaps one into hand).
// dropped: lights set down on the floor, still lit.
// pickups: lights lying in the level switched off, not yet found.
export const lightState: { held: LightKind | null; stowed: LightKind[]; dropped: DroppedLight[]; pickups: Pickup[] } =
  { held: 'candle', stowed: [], dropped: [], pickups: [] };
// `startedAt` is on the performance.now() / requestAnimationFrame clock.
export const gameState: { status: 'playing' | 'won'; startedAt: number } = { status: 'playing', startedAt: 0 };

// Active level geometry and rules. `let` exports are live bindings, so every module importing
// these sees the new values after loadLevel reassigns them.
export let levelWalls: Wall[] = [];           // the building itself
// openAmount: 0 = shut, 1 = fully slid open. seenOpenAmount is how open it was the last time any
// light was on it: fog of war shows that, so a door never visibly changes while unseen.
// opened: a locked door the player has opened (it stays open).
export let doors: (Door & { openAmount: number; seenOpenAmount: number; plateLit: boolean; opened: boolean })[] = [];
export let doorWalls: Wall[] = [];            // whatever part of each door is still in the way
export let walls: Wall[] = [];                // levelWalls + doorWalls: everything blocking movement and light
export let mirrors: Mirror[] = [];
export let lamps: Lamp[] = [];
export let start: GridPos = { gridX: 0, gridY: 0 };
export let goal: GridPos = { gridX: 0, gridY: 0 };

// What's left of a sliding door at `openAmount`: each cell's panel shrinks toward its left/top edge.
// (Movement separately treats the whole cell as blocked until fully open; see isWalkable.)
export const doorPanels = (door: Door, openAmount: number): Wall[] => {
  if (openAmount >= 1) return [];
  const left = 1 - openAmount;
  return door.cells.map(c => door.slide === 'x'
    ? { x: c.gridX * GRID_SIZE, y: c.gridY * GRID_SIZE, w: GRID_SIZE * left, h: GRID_SIZE }
    : { x: c.gridX * GRID_SIZE, y: c.gridY * GRID_SIZE, w: GRID_SIZE, h: GRID_SIZE * left });
}

// Every cell the player's footprint overlaps with its centre at (x, y).
export const footprintCells = (x: number, y: number): GridPos[] => {
  const h = PLAYER_HALF_SIZE, e = 0.001;
  const cells: GridPos[] = [];
  for (let gx = Math.floor((x - h) / GRID_SIZE); gx <= Math.floor((x + h - e) / GRID_SIZE); gx++)
    for (let gy = Math.floor((y - h) / GRID_SIZE); gy <= Math.floor((y + h - e) / GRID_SIZE); gy++)
      cells.push({ gridX: gx, gridY: gy });
  return cells;
}

const rebuildWalls = () => {
  doorWalls = doors.flatMap(d => doorPanels(d, d.openAmount));
  walls = [...levelWalls, ...doorWalls];
}

export const setDoorOpenAmount = (door: typeof doors[0], amount: number) => {
  if (door.openAmount === amount) return;
  door.openAmount = amount;
  rebuildWalls();
}

export const loadLevel = (level: Level) => {
  levelWalls = level.walls;
  doors = level.doors.map(d => ({ ...d, openAmount: 0, seenOpenAmount: 0, plateLit: false, opened: false }));
  rebuildWalls();
  mirrors = level.mirrors;
  lamps = level.lamps;
  start = level.start;
  goal = level.goal;
  player.gridX = level.start.gridX;
  player.gridY = level.start.gridY;
  player.x = player.gridX * GRID_SIZE + GRID_SIZE / 2;
  player.y = player.gridY * GRID_SIZE + GRID_SIZE / 2;
  player.aimAngle = level.startAim;
  lightState.held = level.startHeld;
  lightState.stowed = [...level.startStowed];
  lightState.dropped = level.startDropped.map(d => ({ ...d }));
  lightState.pickups = level.pickups.map(p => ({ ...p }));
  gameState.status = 'playing';
  gameState.startedAt = performance.now();
}


