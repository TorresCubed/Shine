export interface Mirror { x1: number; y1: number; x2: number; y2: number; }
export interface Segment { x1: number; y1: number; x2: number; y2: number; }
export interface Point { x: number; y: number; }
export interface Wall { x: number; y: number; w: number; h: number; }
export interface GridPos { gridX: number; gridY: number; }

// A door acts as a wall while closed. `slide` is the axis it slides open along: along the wall it
// sits in. Kinds:
//   light:  open while its plate is lit.
//   locked: unlocked while its plate is lit; walk into it while unlocked to open it, and it
//           stays open from then on.
export interface Door { kind: 'light' | 'locked'; cells: GridPos[]; plate: GridPos; slide: 'x' | 'y'; }

// A wall lamp: sits on a floor cell against a wall, and shines from that wall's edge. `toWallX/Y`
// is the unit step from the cell toward its wall.
export interface Lamp extends GridPos { toWallX: number; toWallY: number; }

export type LightKind = 'candle' | 'flashlight';

// A light lying in the level, switched off, waiting to be found and picked up. A flashlight is
// drawn pointing along `aimAngle`, and shines that way once picked up.
export interface Pickup extends GridPos { kind: LightKind; aimAngle: number; }

export interface Level {
  name: string;
  width: number;  // in cells
  height: number;
  start: GridPos;
  goal: GridPos;
  walls: Wall[];
  doors: Door[];
  lamps: Lamp[]; // fixed lights: always on, can't be carried
  pickups: Pickup[];
  mirrors: Mirror[];
  startHeld: LightKind | null; // light in hand at the start (lit)
  startStowed: LightKind[];    // lights in your pocket at the start (off)
  startAim: number;            // flashlight aim at the start, radians (point it where they should go)
  startDropped: Pickup[];      // lights already standing on the floor at the start, lit
}

// Flat, typed-array form of every light-blocking segment, built for the ray tracer's inner loop.
// `coords` is SCENE_STRIDE floats per segment: x1, y1, x2, y2, unit normal x, unit normal y.
// `mirrorIndex` is the index into the mirrors list, or -1 for a plain (absorbing) wall edge.
export interface Scene {
  count: number;
  coords: Float64Array;
  mirrorIndex: Int32Array;
  mirrorCount: number;
}
export const SCENE_STRIDE = 6;
