export interface Point {
  x: number;
  y: number;
}
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GridPos {
  gridX: number;
  gridY: number;
}

export type LightKind = 'candle' | 'flashlight';

// A light on the floor: anywhere (x, y in px), but rules go by its cell (gridX, gridY). A flashlight
// points along `aimAngle`.
export interface FloorLight extends GridPos, Point {
  kind: LightKind;
  aimAngle: number;
}

// A wall lamp, on a floor cell, shining from the wall next to it (`toWallX/Y`: the step toward it).
export interface Lamp extends GridPos {
  toWallX: number;
  toWallY: number;
}

// A two-sided mirror across its cell. `step`: orientation in 180°/MIRROR.steps (0 horizontal).
// `control`: fixed, turnable by the player, or turned by the lever with that id.
export interface Mirror extends GridPos {
  step: number;
  control: 'fixed' | 'turnable' | number;
}

// A lever: toggles its door (if any) and turns its mirrors.
export interface Lever extends GridPos {
  id: number;
}

// A door leaf on the edge between two cells. Closed it lies along the edge; it swings 90° about its
// hinge into `into`. Angles in radians, from the hinge to the free end.
export interface DoorLeaf {
  hinge: Point;
  closedAngle: number;
  openAngle: number;
  into: GridPos;
  from: GridPos;
}
// Closed, a door blocks light and movement. light: open while its plate is lit. locked: unlocked while
// lit, and open for good once walked into. lever: toggled by its lever. `trigger`: its plate or lever.
export interface Door {
  kind: 'light' | 'locked' | 'lever';
  leaves: DoorLeaf[];
  trigger: GridPos;
}

export interface Level {
  name: string;
  width: number; // in cells
  height: number;
  start: GridPos;
  goal: GridPos;
  walls: Wall[];
  doors: Door[];
  lamps: Lamp[];
  mirrors: Mirror[];
  levers: Lever[];
  pickups: FloorLight[]; // lights lying switched off, to be found
  startDropped: FloorLight[]; // lights already on the floor, lit
  startHeld: LightKind | null;
  startStowed: LightKind[];
  startAim: number; // radians
}

// A level's doors, mirrors and levers in play (see state.ts). Times on the performance.now() clock.
export type DoorState = Door & {
  openAmount: number; // 0 shut, 1 fully swung open
  seenOpenAmount: number; // as last seen: what fog shows
  triggerOn: boolean; // its plate is lit, or its lever on
  opened: boolean; // a locked door opened for good
  everSeen: boolean;
  wasUnlocked: boolean | null; // a locked door's state last frame (null before its first)
  lockFlashAt: number; // when it last unlocked or re-locked
  showWhole: boolean; // seen this frame, or seen before and doing something: shown as it is, even in fog
  plateWake: number; // ms its plate has been waking while lit, up to PLATE.wakeMs
  winkAt: number; // when its plate went dark
  winkFrom: number; // how awake it was then (0-1)
};
export type MirrorState = Mirror & {
  // `step` is where it's turning to.
  shownStep: number; // where it is (fractional mid-turn): what light, collision and drawing use
  turnLeft: number; // steps still to go (always forward)
  turnSpeed: number; // steps a second
  seenStep: number; // as last seen: what fog shows
  everSeen: boolean; // once seen, you see it turn whatever turns it, even in fog
  turned: number; // steps turned since the level began, never wrapping (a wheel shows this)
};
export type LeverState = Lever & {
  on: boolean;
  pulled: boolean; // pulled since fog memory last refreshed it (so it's remembered whole)
  pulledAt: number; // when it was last pulled, for its flick
};

// Every light-blocking segment as typed arrays, for the ray tracer: SCENE_STRIDE floats each (x1, y1,
// x2, y2, unit normal x, y), and `mirrorIndex` (its mirror, or -1 for a wall edge).
export interface Scene {
  count: number;
  coords: Float64Array;
  mirrorIndex: Int32Array;
  mirrorCount: number;
}
export const SCENE_STRIDE = 6;
