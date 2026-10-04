import { LIGHT } from '../core/consts';
import { drawCandleGlyph, drawFlashlightGlyph, font } from './cells';
import { edgeLine } from './doors';
import { ctx, ed } from './model';

// What's drawn over the map and its light: the 15% line, plate readings, try-lights, the grid, and the
// hovered and selected cell or edge. `w`, `h`: the canvas size.
export const drawOverlays = (w: number, h: number) => {
  const g = ed.doc.grid;
  const level = ed.traced ? ed.currentLevel : null;
  if (ed.traced && ed.view !== 'plain' && ed.showLine) {
    ctx.strokeStyle = '#b6ff5c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of ed.fearLine) {
      ctx.moveTo(x1 * ed.cs, y1 * ed.cs);
      ctx.lineTo(x2 * ed.cs, y2 * ed.cs);
    }
    ctx.stroke();
  }
  if (ed.traced && level && ed.view !== 'plain' && ed.showPlates) {
    level.doors.forEach((d, i) => {
      if (d.kind === 'lever') return;
      const v = ed.traced!.plates[i];
      const lit = v >= LIGHT.litThreshold;
      const px = d.trigger.gridX * ed.cs;
      const py = d.trigger.gridY * ed.cs;
      ctx.strokeStyle = lit ? '#7cc47a' : '#e06a55';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, ed.cs - 4, ed.cs - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px + 2, py + ed.cs * 0.675, ed.cs - 4, ed.cs * 0.275);
      ctx.fillStyle = lit ? '#b6ff5c' : '#f0e6d6';
      ctx.font = font(10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${Math.round(v * 100)}%`, px + ed.cs / 2, py + ed.cs - 2);
    });
  }

  // Try-lights, ringed so they don't look like part of the level.
  for (const t of ed.tries) {
    const mx = (t.x + 0.5) * ed.cs;
    const my = (t.y + 0.5) * ed.cs;
    ctx.strokeStyle = '#ff7ad9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, ed.cs * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    if (t.kind === 'flashlight') drawFlashlightGlyph(ctx, mx, my, (t.aim * Math.PI) / 180, true);
    else drawCandleGlyph(ctx, mx, my);
  }

  // Grid lines, then the hovered and selected cells.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= g[0].length; x++) {
    ctx.beginPath();
    ctx.moveTo(x * ed.cs + 0.5, 0);
    ctx.lineTo(x * ed.cs + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= g.length; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * ed.cs + 0.5);
    ctx.lineTo(w, y * ed.cs + 0.5);
    ctx.stroke();
  }
  if (ed.hover && !ed.hoverEdge) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ed.hover.x * ed.cs + 1, ed.hover.y * ed.cs + 1, ed.cs - 2, ed.cs - 2);
  }
  if (ed.hoverEdge) {
    // The edge a door would go on, with a tick pointing into the cell it would open into.
    const [ix, iy] = ed.hoverEdge.into;
    const [fx, fy] = ed.hoverEdge.from;
    const [x1, y1, x2, y2] = edgeLine(ed.hoverEdge.into, ed.hoverEdge.from);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + (ix - fx) * ed.cs * 0.25, my + (iy - fy) * ed.cs * 0.25);
    ctx.stroke();
  }
  if (ed.selected) {
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 2;
    ctx.strokeRect(ed.selected.x * ed.cs + 1, ed.selected.y * ed.cs + 1, ed.cs - 2, ed.cs - 2);
  }
};
