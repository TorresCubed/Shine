import type { Door, FloorLight, GridPos, Lamp, Level, Lever, LightKind, Mirror, Wall } from "./interfaces";
import { GRID_SIZE, PLAYER_HALF_SIZE } from "./consts";
import { cellCenter } from "./util";

// Mutable game state. `let` exports are live bindings: importers see the new values after
// loadLevel reassigns them.

export const keysDown = new Set<string>();
export const camera = { zoom: 1 }; // screen px per world px

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

// Doors: openAmount 0 = shut, 1 = fully slid open. seenOpenAmount is how open it was the last time
// the player saw it, which is what fog of war shows. triggerOn: its plate is lit, or its lever is
// on. opened: a locked door the player has opened (it stays open).
export type DoorState = Door & { openAmount: number; seenOpenAmount: number; triggerOn: boolean; opened: boolean };
// Mirrors: seenStep is the orientation the player last saw it at, for fog of war.
export type MirrorState = Mirror & { seenStep: number };
export type LeverState = Lever & { on: boolean };

export let levelWalls: Wall[] = [];
export let doors: DoorState[] = [];
export let walls: Wall[] = []; // levelWalls + whatever part of each door is still in the way
export let mirrors: MirrorState[] = [];
export let levers: LeverState[] = [];
export let lamps: Lamp[] = [];
export let start: GridPos = { gridX: 0, gridY: 0 };
export let goal: GridPos = { gridX: 0, gridY: 0 };

// What's left of a sliding door at `openAmount`: each cell's panel shrinks toward its left/top edge.
// (Movement treats the whole cell as blocked until fully open; see isWalkable.)
export const doorPanels = (door: Door, openAmount: number): Wall[] => {
  if (openAmount >= 1) return [];
  const left = 1 - openAmount;
  return door.cells.map(c => door.slide === 'x'
    ? { x: c.gridX * GRID_SIZE, y: c.gridY * GRID_SIZE, w: GRID_SIZE * left, h: GRID_SIZE }
    : { x: c.gridX * GRID_SIZE, y: c.gridY * GRID_SIZE, w: GRID_SIZE, h: GRID_SIZE * left });
}

export const setDoorOpenAmount = (door: DoorState, amount: number) => {
  if (door.openAmount === amount) return;
  door.openAmount = amount;
  walls = [...levelWalls, ...doors.flatMap(d => doorPanels(d, d.openAmount))];
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

export const loadLevel = (level: Level) => {
  levelWalls = level.walls;
  doors = level.doors.map(d => ({ ...d, openAmount: 0, seenOpenAmount: 0, triggerOn: false, opened: false }));
  walls = [...levelWalls, ...doors.flatMap(d => doorPanels(d, 0))];
  mirrors = level.mirrors.map(m => ({ ...m, seenStep: m.step }));
  levers = level.levers.map(l => ({ ...l, on: false }));
  lamps = level.lamps;
  start = level.start;
  goal = level.goal;
  Object.assign(player, cellCenter(start), start, { aimAngle: level.startAim });
  lightState.held = level.startHeld;
  lightState.stowed = [...level.startStowed];
  lightState.dropped = level.startDropped.map(d => ({ ...d }));
  lightState.pickups = level.pickups.map(p => ({ ...p }));
  gameState.status = 'playing';
  gameState.startedAt = performance.now();
}
