import { signal } from '@preact/signals';
import type {
  DoorState,
  FloorLight,
  GridPos,
  Lamp,
  Level,
  LeverState,
  LightKind,
  Mirror,
  MirrorState,
  SecretWallState,
  Wall,
} from './types';
import { cellCenter, doorLeaves } from './util';

// Game state. Most of it changes every frame, so it's plain objects the game mutates. The few values
// the UI shows (what you're carrying, touch mode, won or playing) are signals, so the UI updates when
// they change; set them by assigning `.value` (a new array for `stowed`, never mutated in place).

// ---- Input ----

export const keysDown = new Set<string>();
// The on-screen stick (input/touch.ts): how far it's pushed, each axis -1..1 and at most 1 long
// (0, 0 when let go).
export const stick = { x: 0, y: 0 };
// `touch` turns on at the first touch, for touch-only controls and prompts.
export const input = { touch: signal(false) };

// ---- The view ----

export const camera = {
  zoom: 1, // screen px per world px
  fitted: true, // still at the level's fit zoom (re-fitted if the screen changes size)
  panX: 0, // world px a two-finger drag has moved the view off the player; drifts back as you walk
  panY: 0,
  pinching: false, // a two-finger gesture is under way
  intro: false, // a new level's zoom-in is still to come (zooming yourself cancels it)
  glideMs: null as number | null, // how long the next zoom change glides (null: CAMERA.zoomEaseMs)
};

// ---- The level in play ----

export const gameState = {
  status: signal<'playing' | 'won'>('playing'),
  startedAt: 0, // performance.now() clock
  trinketTaken: false, // the level's trinket picked up this try
};

// The level being played, as loadLevel sets it up.
export const level = {
  walls: [] as Wall[], // the solid ones: a secret wall is left out while it's a ghost
  allWalls: [] as Wall[], // every wall, secret ones solid or not (what the wall art shows)
  secretWalls: [] as SecretWallState[],
  trinket: null as GridPos | null, // until taken
  doors: [] as DoorState[],
  mirrors: [] as MirrorState[],
  levers: [] as LeverState[],
  lamps: [] as Lamp[],
  start: { gridX: 0, gridY: 0 } as GridPos,
  goal: { gridX: 0, gridY: 0 } as GridPos,
};

export const player = {
  x: 0, // centre, in px; moves freely
  y: 0,
  gridX: 0, // the cell the centre is in: what interactions use
  gridY: 0,
  aimAngle: 0, // flashlight aim, radians
};

export const lightState = {
  held: signal<LightKind | null>('candle'), // in hand, lit (at most one of each kind carried in all)
  stowed: signal<LightKind[]>([]), // carried, switched off (F swaps one into hand)
  dropped: [] as FloorLight[], // on the floor, lit
  pickups: [] as FloorLight[], // lying in the level switched off, not yet found
};

// Shines: a glint where a light was just picked up or dropped (world px, performance.now() clock).
// The renderer draws each for SHINE_MS, then drops it.
export const shines: { x: number; y: number; at: number }[] = [];

// ---- Functions ----

export const shine = (x: number, y: number) => shines.push({ x, y, at: performance.now() });

// A mirror's state at the start, set at `step`.
export const startingMirror = (m: Mirror, step = m.step): MirrorState => ({
  ...m,
  step,
  shownStep: step,
  turnLeft: 0,
  turnSpeed: 0,
  seenStep: step,
  everSeen: false,
  turned: 0,
});

// Every door leaf in the level, where it is now.
export const allDoorLeaves = () => level.doors.flatMap(d => doorLeaves(d, d.openAmount));

export const loadLevel = (source: Level) => {
  // Typed, so a field added to `level` and forgotten here is an error, not left over from the last level.
  const fresh: typeof level = {
    walls: source.walls,
    allWalls: source.walls,
    secretWalls: source.secretWalls.map(s => ({ ...s, solid: true, shown: 0, seenShown: 0 })),
    trinket: source.trinket,
    doors: source.doors.map(d => ({
      ...d,
      openAmount: 0,
      seenOpenAmount: 0,
      triggerOn: false,
      opened: false,
      everSeen: false,
      wasUnlocked: null,
      lockFlashAt: -Infinity,
      showWhole: false,
      plateWake: 0,
      winkAt: -Infinity,
      winkFrom: 0,
    })),
    mirrors: source.mirrors.map(m => startingMirror(m)),
    levers: source.levers.map(l => ({ ...l, on: false, pulled: false, pulledAt: -Infinity })),
    lamps: source.lamps,
    start: source.start,
    goal: source.goal,
  };
  Object.assign(level, fresh);

  Object.assign(player, cellCenter(source.start), source.start, { aimAngle: source.startAim });

  lightState.held.value = source.startHeld;
  lightState.stowed.value = [...source.startStowed];
  lightState.dropped = source.startDropped.map(d => ({ ...d }));
  lightState.pickups = source.pickups.map(p => ({ ...p }));
  gameState.status.value = 'playing';
  gameState.startedAt = performance.now();
  gameState.trinketTaken = false;
  shines.length = 0;
};
