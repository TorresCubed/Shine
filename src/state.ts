import type { Door, FloorLight, GridPos, Lamp, Level, Lever, LightKind, Mirror, Segment, Wall } from "./interfaces";
import { GRID_SIZE, PLAYER_HALF_SIZE } from "./consts";
import { cellCenter, easeInOut } from "./util";

// Mutable game state. `let` exports are live bindings: importers see the new values after
// loadLevel reassigns them.

export const keysDown = new Set<string>();
// The on-screen stick (touchControls.ts): how far it's pushed, each axis -1..1 and at most 1 long
// (0, 0 when let go). `touch` turns on at the first touch, for touch-only controls and prompts.
export const stick = { x: 0, y: 0 };
export const input = { touch: false };
// zoom: screen px per world px. fitted: still at the level's fit zoom (it re-fits if the screen
// changes size). pan: how far (world px) a two-finger drag has moved the view off the player; it
// drifts back once you walk. pinching: a two-finger gesture is under way. intro: a new level's
// zoom-in from the overview is still to come (zooming yourself cancels it). glideMs: how long the next
// zoom change takes to glide (null: ZOOM_EASE_MS).
export const camera = { zoom: 1, fitted: true, panX: 0, panY: 0, pinching: false, intro: false, glideMs: null as number | null };

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

// Doors: openAmount 0 = shut, 1 = fully swung open. seenOpenAmount is how open it was the last time
// the player saw it, which is what fog of war shows. triggerOn: its plate is lit, or its lever is
// on. opened: a locked door the player has opened (it stays open). everSeen: the player has seen it
// at some point. wasUnlocked: a locked door's state last frame (null before its first), and
// lockFlashAt when it last changed (performance.now() clock), for the flash that shows it even in fog.
// showWhole: this frame it's seen, or (seen before) it's doing something, so it's shown as it is,
// all of it, even in fog (the renderer refreshes its memory). plateWake: how long its plate has been
// waking, in ms, from 0 (dead) to PLATE_WAKE_MS (active), while triggerOn. Going dark it drops to 0
// and winks out instead: winkAt when (performance.now() clock), winkFrom how awake it was (0-1).
export type DoorState = Door & {
  openAmount: number; seenOpenAmount: number; triggerOn: boolean; opened: boolean;
  everSeen: boolean; wasUnlocked: boolean | null; lockFlashAt: number; showWhole: boolean; plateWake: number; winkAt: number; winkFrom: number;
};
// Mirrors: `step` is where it's turning to; `shownStep` is where it actually is (fractional mid-turn),
// which light, collision and drawing all use, with `turnLeft` steps still to go (always forward) at
// `turnSpeed` steps a second.
// seenStep is the orientation the player last saw it at, for fog of war. everSeen: the player has
// seen it at some point, so they see it turn (all of it) whatever turns it, even in fog. turned: how
// many steps it's turned since the level began, never wrapping (a wheel that turns it shows this).
export type MirrorState = Mirror & { shownStep: number; turnLeft: number; turnSpeed: number; seenStep: number; everSeen: boolean; turned: number };
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
  const h = PLAYER_HALF_SIZE, e = 0.001;
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
  mirrors = level.mirrors.map(m => ({ ...m, shownStep: m.step, turnLeft: 0, turnSpeed: 0, seenStep: m.step, everSeen: false, turned: 0 }));
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
