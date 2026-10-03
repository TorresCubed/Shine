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

// A light on the floor. Like the player, it lies anywhere (x, y, in px) but belongs to the cell it's
// in (gridX, gridY), which is what rules use (one light to a cell, picking up from your cell). A
// flashlight points along `aimAngle` (and shines that way once picked up).
export interface FloorLight extends GridPos, Point {
  kind: LightKind;
  aimAngle: number;
}

// A wall lamp sits on a floor cell and shines from the edge of the wall next to it. `toWallX/Y` is
// the unit step from the cell toward that wall.
export interface Lamp extends GridPos {
  toWallX: number;
  toWallY: number;
}

// A mirror: a thin two-sided segment across the middle of its cell. `step` is its orientation, in
// units of 180° / MIRROR.steps (0 = horizontal). `control` is what can turn it: nothing, the player
// (Space, standing in its cell), or the lever with that id (a step per pull).
export interface Mirror extends GridPos {
  step: number;
  control: 'fixed' | 'turnable' | number;
}

// A lever, pulled with Space while standing on it. It toggles its pair's door (if any) and turns the mirrors linked to it.
export interface Lever extends GridPos {
  id: number;
}

// A door sits on edges between floor cells, one leaf per edge. Closed, a leaf lies along its edge;
// opening, it swings 90° about its hinge (one end of the edge) into the `into` cell, ending flat
// along that cell's side. Angles are in radians, from the hinge to the leaf's free end.
export interface DoorLeaf {
  hinge: Point;
  closedAngle: number;
  openAngle: number;
  into: GridPos;
  from: GridPos;
}
// A door blocks light and movement while closed.
//   light:  open while its plate is lit.
//   locked: unlocked while its plate is lit; walk into it then and it opens for good.
//   lever:  its lever toggles it open and shut.
// `trigger` is the plate, or the lever, that works it.
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

// A level's doors, mirrors and levers as they are in play (see state.ts). Times are on the
// performance.now() clock.
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

// Flat, typed-array form of every light-blocking segment, for the ray tracer's inner loop.
// `coords` is SCENE_STRIDE floats per segment: x1, y1, x2, y2, unit normal x, unit normal y.
// `mirrorIndex` is the index into the mirrors list, or -1 for a plain (absorbing) wall edge.
export interface Scene {
  count: number;
  coords: Float64Array;
  mirrorIndex: Int32Array;
  mirrorCount: number;
}
export const SCENE_STRIDE = 6;
