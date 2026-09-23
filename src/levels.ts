import type { Level } from "./interfaces";
import { GRID_SIZE } from "./consts";

const G = GRID_SIZE;

// Start and goal always sit against an edge wall: they'll become the entrance and exit doors.

// Level 1: an empty bounded room — just grid movement and the candle, no mirrors or flashlight.
// 14x10 cells with a 1-cell wall frame, leaving a 12x8 open interior. Start on the left wall, goal
// on the right, so reaching it means walking out of the candle's reach.
const level1: Level = {
  name: "Level 1",
  start: { gridX: 1, gridY: 4 },
  goal: { gridX: 12, gridY: 5 },
  walls: [
    { x: 0, y: 0, w: 14 * G, h: G },      // top
    { x: 0, y: 9 * G, w: 14 * G, h: G },  // bottom
    { x: 0, y: 0, w: G, h: 10 * G },      // left
    { x: 13 * G, y: 0, w: G, h: 10 * G }, // right
  ],
  mirrors: [],
  allowFlashlight: false,
};

// Level 2: an L-shaped hallway, 3 cells wide. Down from the top-left, then right along the bottom
// to the exit. A desk against the hallway's inside wall, just past the corner, casts the first
// real shadow. 12x10 cells: frame plus a solid block filling the top-right to make the L.
const level2: Level = {
  name: "Level 2",
  start: { gridX: 2, gridY: 1 },
  goal: { gridX: 10, gridY: 7 },
  walls: [
    { x: 0, y: 0, w: 12 * G, h: G },      // top
    { x: 0, y: 9 * G, w: 12 * G, h: G },  // bottom
    { x: 0, y: 0, w: G, h: 10 * G },      // left
    { x: 11 * G, y: 0, w: G, h: 10 * G }, // right
    { x: 4 * G, y: G, w: 7 * G, h: 5 * G }, // inside of the L
    // Desk. Meant to be a single non-wall obstruction (furniture), not part of the building.
    // Stand-in as a wall until there are assets and a separate obstruction type.
    { x: 5 * G, y: 6 * G, w: G, h: G },
  ],
  mirrors: [],
  allowFlashlight: false,
};

// Played in order; finishing the last one loops back to the first.
export const levels: Level[] = [level1, level2];
