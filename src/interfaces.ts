export interface Mirror { x1: number; y1: number; x2: number; y2: number; }
export interface Segment { x1: number; y1: number; x2: number; y2: number; }
export interface Point { x: number; y: number; }

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
