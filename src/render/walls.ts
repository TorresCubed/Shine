import { cellCenter } from "../core/util";
import type { Wall } from "../core/types";
import { GRID_SIZE, FOG } from "../core/consts";
import { levelWalls } from "../core/state";
import { worldCanvas } from "./canvases";

// Walls are autotiled from walls.png: every wall cell gets the tile's middle, and only the sides that
// face floor get its rim, so neighbouring wall cells join into one solid wall. Corners are the tile's
// own outer corner, a continuing edge, or an inner corner (the rim bent round, where only the
// diagonal is floor). Baked once per level into wallArt, with a grayed, darkened copy for fog memory.
const WALL_RIM = 4; // how deep the rim is in walls.png, in its pixels
let wallImage: HTMLImageElement;
export const setWallImage = (img: HTMLImageElement) => { wallImage = img; };
export const wallArt = document.createElement('canvas');
export const dimWallArt = document.createElement('canvas');
// The walls as a solid mask (opaque in walls, clear elsewhere), for trimming lit wall faces to them,
// and as a grid (1 = wall cell, row by row), for quick lookups.
export const wallMask = document.createElement('canvas');
let wallCells = new Uint8Array(0);
let wallArtFor: Wall[] | null = null;

// Whether a cell is wall (outside the level counts as wall), from the grid.
export const isWallCell = (gx: number, gy: number) => {
  const cols = worldCanvas.width / GRID_SIZE, rows = worldCanvas.height / GRID_SIZE;
  return gx < 0 || gy < 0 || gx >= cols || gy >= rows || wallCells[gy * cols + gx] === 1;
}

export const ensureWallArt = () => {
  if (wallArtFor === levelWalls) return;
  wallArtFor = levelWalls;
  const cols = worldCanvas.width / GRID_SIZE, rows = worldCanvas.height / GRID_SIZE;
  const isWall = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return true; // no rim facing out of the level
    const { x, y } = cellCenter({ gridX: gx, gridY: gy });
    return levelWalls.some(w => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
  }

  wallArt.width = dimWallArt.width = wallMask.width = worldCanvas.width;
  wallArt.height = dimWallArt.height = wallMask.height = worldCanvas.height;
  const m = wallMask.getContext('2d')!;
  m.fillStyle = '#fff';
  for (const w of levelWalls) m.fillRect(w.x, w.y, w.w, w.h);
  wallCells = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) wallCells[gy * cols + gx] = isWall(gx, gy) ? 1 : 0;
  const c = wallArt.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const n = wallImage.width, r = WALL_RIM, k = GRID_SIZE / n, mid = n - 2 * r;
  // Copies a rect of walls.png (in its pixels) to that offset within the cell at (x0, y0).
  const piece = (x0: number, y0: number, sx: number, sy: number, sw: number, sh: number, dx = sx, dy = sy) =>
    c.drawImage(wallImage, sx, sy, sw, sh, x0 + dx * k, y0 + dy * k, sw * k, sh * k);

  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (!isWall(gx, gy)) continue;
    const x0 = gx * GRID_SIZE, y0 = gy * GRID_SIZE;
    const up = isWall(gx, gy - 1), down = isWall(gx, gy + 1), left = isWall(gx - 1, gy), right = isWall(gx + 1, gy);
    piece(x0, y0, r, r, mid, mid);
    // Sides: the rim if it faces floor, otherwise more of the middle.
    piece(x0, y0, r, up ? r : 0, mid, r, r, 0);
    piece(x0, y0, r, down ? n - 2 * r : n - r, mid, r, r, n - r);
    piece(x0, y0, left ? r : 0, r, r, mid, 0, r);
    piece(x0, y0, right ? n - 2 * r : n - r, r, r, mid, n - r, r);
    // Corners.
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const vert = cy < 0 ? up : down, horiz = cx < 0 ? left : right, diag = isWall(gx + cx, gy + cy);
      const dx = cx < 0 ? 0 : n - r, dy = cy < 0 ? 0 : n - r;           // the corner's spot in the cell
      const inX = cx < 0 ? r : n - 2 * r, inY = cy < 0 ? r : n - 2 * r;   // the same, one rim further in
      if (!vert && !horiz) piece(x0, y0, dx, dy, r, r);                 // outer corner
      else if (!vert) piece(x0, y0, inX, dy, r, r, dx, dy);             // top/bottom rim runs through
      else if (!horiz) piece(x0, y0, dx, inY, r, r, dx, dy);            // side rim runs through
      else if (diag) piece(x0, y0, inX, inY, r, r, dx, dy);             // solid wall
      else {
        // Inner corner: each pixel is the rim at its distance from the corner point, taken from the
        // middle of the top or bottom rim.
        for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) {
          const depth = Math.max(i, j);
          const px = cx < 0 ? i : r - 1 - i, py = cy < 0 ? j : r - 1 - j;
          piece(x0, y0, n >> 1, cy < 0 ? depth : n - 1 - depth, 1, 1, dx + px, dy + py);
        }
      }
    }
  }

  const d = dimWallArt.getContext('2d')!;
  d.filter = `grayscale(1) brightness(${FOG.floorBrightness})`;
  d.drawImage(wallArt, 0, 0);
}
