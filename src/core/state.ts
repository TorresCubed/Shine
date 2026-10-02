import type { Door, FloorLight, GridPos, Lamp, Level, Lever, LightKind, Mirror, Segment, Wall } from "./types";
import { GRID_SIZE, PLAYER } from "./consts";
import { cellCenter, easeInOut } from "./util";

// Mutable game state. The `let` exports are live bindings, reassigned by loadLevel.

export const keysDown = new Set<string>();
// The on-screen stick (input/touch.ts): how far it's pushed, each axis -1..1 and at most 1 long
// (0, 0 when let go). `touch` turns on at the first touch, for touch-only controls and prompts.
export const stick = { x: 0, y: 0 };
export const input = { touch: false };
export const camera = {
  zoom: 1,          // screen px per world px
  fitted: true,     // still at the level's fit zoom (re-fitted if the screen changes size)
  panX: 0,          // world px a two-finger drag has moved the view off the player; drifts back as you walk
  panY: 0,
  pinching: false,  // a two-finger gesture is under way
  intro: false,     // a new level's zoom-in is still to come (zooming yourself cancels it)
  glideMs: null as number | null, // how long the next zoom change glides (null: CAMERA.zoomEaseMs)
};

export const player = {
  x: 0,     // centre, in px; moves freely
  y: 0,
  gridX: 0, // the cell the centre is in: what interactions use
  gridY: 0,
  aimAngle: 0, // flashlight aim, radians
};

// held:    the light in hand, lit (at most one; at most one of each kind carried in total)
// stowed:  lights carried, switched off (F swaps one into hand)
// dropped: lights on the floor, lit
// pickups: lights lying in the level switched off, not yet found
export const lightState: { held: LightKind | null; stowed: LightKind[]; dropped: FloorLight[]; pickups: FloorLight[] } =
  { held: 'candle', stowed: [], dropped: [], pickups: [] };

// `startedAt` is on the performance.now() / requestAnimationFrame clock.
export const gameState: { status: 'playing' | 'won'; startedAt: number } = { status: 'playing', startedAt: 0 };

// Times are on the performance.now() clock.
export type DoorState = Door & {
  openAmount: number;          // 0 shut, 1 fully swung open
  seenOpenAmount: number;      // as last seen: what fog shows
  triggerOn: boolean;          // its plate is lit, or its lever on
  opened: boolean;             // a locked door opened for good
  everSeen: boolean;
  wasUnlocked: boolean | null; // a locked door's state last frame (null before its first)
  lockFlashAt: number;         // when it last unlocked or re-locked
  showWhole: boolean;          // seen this frame, or seen before and doing something: shown as it is, even in fog
  plateWake: number;           // ms its plate has been waking while lit, up to PLATE.wakeMs
  winkAt: number;              // when its plate went dark
  winkFrom: number;            // how awake it was then (0-1)
};
export type MirrorState = Mirror & {
  // `step` is where it's turning to.
  shownStep: number;  // where it is (fractional mid-turn): what light, collision and drawing use
  turnLeft: number;   // steps still to go (always forward)
  turnSpeed: number;  // steps a second
  seenStep: number;   // as last seen: what fog shows
  everSeen: boolean;  // once seen, you see it turn whatever turns it, even in fog
  turned: number;     // steps turned since the level began, never wrapping (a wheel shows this)
};
// A mirror's state at the start, set at `step`.
export const mirrorState = (m: Mirror, step = m.step): MirrorState =>
  ({ ...m, step, shownStep: step, turnLeft: 0, turnSpeed: 0, seenStep: step, everSeen: false, turned: 0 });
// pulled: pulled since the renderer last showed it (all of it, even in fog).
export type LeverState = Lever & { on: boolean; pulled: boolean };

export let levelWalls: Wall[] = [];
export let doors: DoorState[] = [];
export let mirrors: MirrorState[] = [];
export let levers: LeverState[] = [];
export let lamps: Lamp[] = [];
export let start: GridPos = { gridX: 0, gridY: 0 };
export let goal: GridPos = { gridX: 0, gridY: 0 };

// A door's leaves at `openAmount`, each swung that far (eased, so it starts and stops gently) from
// along its edge towards flat against its `into` cell's side. They block light like a wall's edge.
export const doorLeaves = (door: Door, openAmount: number): Segment[] => {
  const t = easeInOut(openAmount);
  return door.leaves.map(l => {
    const a = l.closedAngle + (l.openAngle - l.closedAngle) * t;
    return { x1: l.hinge.x, y1: l.hinge.y, x2: l.hinge.x + Math.cos(a) * GRID_SIZE, y2: l.hinge.y + Math.sin(a) * GRID_SIZE };
  });
}

// Every door leaf in the level, where it is now.
export const allDoorLeaves = () => doors.flatMap(d => doorLeaves(d, d.openAmount));

// When each thing last got a scale punch (keyed 'player' or 'lever x,y'), on the performance.now()
// clock. The renderer draws it popping.
export const punches = new Map<string, number>();
export const punch = (key: string) => punches.set(key, performance.now());

// Shines: a glint where a light was just picked up or dropped (world px, performance.now() clock).
// The renderer draws each for SHINE_MS, then drops it.
export const shines: { x: number; y: number; at: number }[] = [];
export const shine = (x: number, y: number) => shines.push({ x, y, at: performance.now() });

// Every cell the player's footprint overlaps with its centre at (x, y).
export const footprintCells = (x: number, y: number): GridPos[] => {
  const h = PLAYER.collisionRadius, e = 0.001;
  const cells: GridPos[] = [];
  for (let gx = Math.floor((x - h) / GRID_SIZE); gx <= Math.floor((x + h - e) / GRID_SIZE); gx++)
    for (let gy = Math.floor((y - h) / GRID_SIZE); gy <= Math.floor((y + h - e) / GRID_SIZE); gy++)
      cells.push({ gridX: gx, gridY: gy });
  return cells;
}

export const loadLevel = (level: Level) => {
  levelWalls = level.walls;
  doors = level.doors.map(d => ({
    ...d, openAmount: 0, seenOpenAmount: 0, triggerOn: false, opened: false, everSeen: false, wasUnlocked: null, lockFlashAt: -Infinity, showWhole: false, plateWake: 0, winkAt: -Infinity, winkFrom: 0,
  }));
  mirrors = level.mirrors.map(m => mirrorState(m));
  levers = level.levers.map(l => ({ ...l, on: false, pulled: false }));
  lamps = level.lamps;
  start = level.start;
  goal = level.goal;
  Object.assign(player, cellCenter(start), start, { aimAngle: level.startAim });
  lightState.held = level.startHeld;
  lightState.stowed = [...level.startStowed];
  lightState.dropped = level.startDropped.map(d => ({ ...d }));
  lightState.pickups = level.pickups.map(p => ({ ...p }));
  gameState.status = 'playing';
  shines.length = 0;
  gameState.startedAt = performance.now();
}
