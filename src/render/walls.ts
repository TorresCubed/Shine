import { cellCenter, insideWalls } from '../core/util';
import type { Wall } from '../core/types';
import { GRID_SIZE } from '../core/consts';
import { level } from '../core/state';
import { worldCanvas } from './canvases';
import { wallImage, dimCopy } from './art';

// Walls are autotiled from walls.png: each wall cell gets the tile's middle, with its rim only on sides
// facing floor, so neighbours join into one wall. Corners are an outer corner, a continuing edge, or
// an inner corner. Baked once per level, with a fog copy.
const WALL_RIM = 4; // how deep the rim is in walls.png, in its pixels
export const wallArt = document.createElement('canvas');
export const dimWallArt = document.createElement('canvas');
// The walls as a mask (for trimming lit faces) and as a grid of cells (1 = wall, row by row).
export const wallMask = document.createElement('canvas');
let wallCells = new Uint8Array(0);
let wallArtFor: Wall[] | null = null;

// Whether a cell is wall (outside the level counts).
export const isWallCell = (gx: number, gy: number) => {
  const cols = worldCanvas.width / GRID_SIZE;
  const rows = worldCanvas.height / GRID_SIZE;
  return gx < 0 || gy < 0 || gx >= cols || gy >= rows || wallCells[gy * cols + gx] === 1;
};

export const ensureWallArt = () => {
  if (wallArtFor === level.walls) return;
  wallArtFor = level.walls;
  const cols = worldCanvas.width / GRID_SIZE;
  const rows = worldCanvas.height / GRID_SIZE;
  const isWall = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return true; // no rim facing out of the level
    return insideWalls(cellCenter({ gridX: gx, gridY: gy }), level.walls);
  };

  wallArt.width = dimWallArt.width = wallMask.width = worldCanvas.width;
  wallArt.height = dimWallArt.height = wallMask.height = worldCanvas.height;
  const m = wallMask.getContext('2d')!;
  m.fillStyle = '#fff';
  for (const w of level.walls) m.fillRect(w.x, w.y, w.w, w.h);
  wallCells = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) wallCells[gy * cols + gx] = isWall(gx, gy) ? 1 : 0;
  const c = wallArt.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const n = wallImage.width;
  const r = WALL_RIM;
  const k = GRID_SIZE / n;
  const mid = n - 2 * r;
  // Copies a rect of walls.png (in its pixels) to that offset within the cell at (x0, y0).
  const piece = (x0: number, y0: number, sx: number, sy: number, sw: number, sh: number, dx = sx, dy = sy) =>
    c.drawImage(wallImage, sx, sy, sw, sh, x0 + dx * k, y0 + dy * k, sw * k, sh * k);

  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      if (!isWall(gx, gy)) continue;
      const x0 = gx * GRID_SIZE;
      const y0 = gy * GRID_SIZE;
      const up = isWall(gx, gy - 1);
      const down = isWall(gx, gy + 1);
      const left = isWall(gx - 1, gy);
      const right = isWall(gx + 1, gy);
      piece(x0, y0, r, r, mid, mid);
      // Sides: the rim if it faces floor, otherwise more of the middle.
      piece(x0, y0, r, up ? r : 0, mid, r, r, 0);
      piece(x0, y0, r, down ? n - 2 * r : n - r, mid, r, r, n - r);
      piece(x0, y0, left ? r : 0, r, r, mid, 0, r);
      piece(x0, y0, right ? n - 2 * r : n - r, r, r, mid, n - r, r);
      for (const [cx, cy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const vert = cy < 0 ? up : down;
        const horiz = cx < 0 ? left : right;
        const diag = isWall(gx + cx, gy + cy);
        const dx = cx < 0 ? 0 : n - r;
        const dy = cy < 0 ? 0 : n - r; // the corner's spot in the cell
        const inX = cx < 0 ? r : n - 2 * r;
        const inY = cy < 0 ? r : n - 2 * r; // the same, one rim further in
        if (!vert && !horiz)
          piece(x0, y0, dx, dy, r, r); // outer corner
        else if (!vert)
          piece(x0, y0, inX, dy, r, r, dx, dy); // top/bottom rim runs through
        else if (!horiz)
          piece(x0, y0, dx, inY, r, r, dx, dy); // side rim runs through
        else if (diag)
          piece(x0, y0, inX, inY, r, r, dx, dy); // solid wall
        else {
          // Inner corner: each pixel is the rim at its distance from the corner.
          for (let i = 0; i < r; i++)
            for (let j = 0; j < r; j++) {
              const depth = Math.max(i, j);
              const px = cx < 0 ? i : r - 1 - i;
              const py = cy < 0 ? j : r - 1 - j;
              piece(x0, y0, n >> 1, cy < 0 ? depth : n - 1 - depth, 1, 1, dx + px, dy + py);
            }
        }
      }
    }

  dimCopy(wallArt, dimWallArt);
};
