import { lampSide } from '../content/levelFormat';
import type { Cell } from './levelCode';
import { ed } from './model';

// Drawing each map cell.

export const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${Math.max(6, (px * ed.cs) / 40)}px system-ui`;

export const drawFlashlightGlyph = (
  c: CanvasRenderingContext2D,
  mx: number,
  my: number,
  angle: number,
  lit: boolean,
) => {
  c.save();
  c.translate(mx, my);
  c.rotate(angle);
  c.fillStyle = '#3b3f46';
  c.fillRect(-ed.cs * 0.28, -ed.cs * 0.07, ed.cs * 0.4, ed.cs * 0.14);
  c.fillStyle = '#555b64';
  c.fillRect(ed.cs * 0.1, -ed.cs * 0.12, ed.cs * 0.14, ed.cs * 0.24);
  c.fillStyle = lit ? '#fff6c8' : '#9aa3ab';
  c.fillRect(ed.cs * 0.24, -ed.cs * 0.1, ed.cs * 0.04, ed.cs * 0.2);
  c.restore();
};

export const drawCandleGlyph = (c: CanvasRenderingContext2D, mx: number, my: number) => {
  c.fillStyle = '#e8e0d0';
  c.fillRect(mx - ed.cs * 0.07, my - ed.cs * 0.05, ed.cs * 0.14, ed.cs * 0.28);
  c.fillStyle = '#ffb347';
  c.beginPath();
  c.ellipse(mx, my - ed.cs * 0.14, ed.cs * 0.07, ed.cs * 0.12, 0, 0, Math.PI * 2);
  c.fill();
};

export const drawCell = (c: CanvasRenderingContext2D, x: number, y: number, cell: Cell) => {
  const px = x * ed.cs;
  const py = y * ed.cs;
  const mx = px + ed.cs / 2;
  const my = py + ed.cs / 2;
  c.fillStyle = cell.ch === '#' ? '#2b2520' : '#5c4a36';
  c.fillRect(px, py, ed.cs, ed.cs);
  c.lineWidth = 3;
  const label = (text: string, color: string) => {
    c.fillStyle = color;
    c.font = font(14, true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, mx, my);
  };
  if (cell.ch === 'S') {
    c.strokeStyle = '#e8e0d0';
    c.beginPath();
    c.arc(mx, my, ed.cs * 0.33, 0, Math.PI * 2);
    c.stroke();
    label('S', '#e8e0d0');
  } else if (cell.ch === 'G') {
    const r = ed.cs * 0.32;
    c.strokeStyle = '#f5c542';
    c.beginPath();
    c.moveTo(mx, my - r);
    c.lineTo(mx + r, my);
    c.lineTo(mx, my + r);
    c.lineTo(mx - r, my);
    c.closePath();
    c.stroke();
  } else if (cell.ch === 'L') {
    const side = lampSide(x, y, (sx, sy) => ed.doc.grid[sy]?.[sx]?.ch === '#');
    c.fillStyle = '#ffd27a';
    c.beginPath();
    if (side) {
      const ex = mx + (side[0] * ed.cs) / 2;
      const ey = my + (side[1] * ed.cs) / 2;
      const facing = Math.atan2(-side[1], -side[0]);
      c.arc(ex, ey, ed.cs * 0.22, facing - Math.PI / 2, facing + Math.PI / 2);
    } else c.arc(mx, my, ed.cs * 0.2, 0, Math.PI * 2);
    c.fill();
    if (!side) label('!', '#e06a55');
  } else if (cell.ch === 'F') drawFlashlightGlyph(c, mx, my, 0, false);
  else if (cell.ch === 'C') drawCandleGlyph(c, mx, my);
  else if (cell.mirror) {
    const key = `${x},${y}`;
    const previewed = ed.preview?.[key] !== undefined;
    const step = previewed ? ed.preview![key] : cell.mirror.step;
    const a = (step * Math.PI) / 8;
    const dx = Math.cos(a) * ed.cs * 0.35;
    const dy = Math.sin(a) * ed.cs * 0.35;
    c.strokeStyle = previewed ? '#f5c542' : '#dff2ff';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(mx - dx, my - dy);
    c.lineTo(mx + dx, my + dy);
    c.stroke();
    const ctl = cell.mirror.control;
    c.fillStyle = '#8a93a0';
    if (ctl === 'turnable') {
      c.beginPath();
      c.arc(mx, my, 5, 0, Math.PI * 2);
      c.fill();
    } else if (typeof ctl === 'number') {
      c.fillRect(mx - 5, my - 5, 10, 10);
      c.fillStyle = '#e8e0d0';
      c.font = font(11, true);
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(String(ctl), px + 3, py + 2);
    }
  } else if (cell.ch >= '1' && cell.ch <= '9') {
    const n = Number(cell.ch);
    if (ed.doc.kinds[n] === 'lever') {
      c.fillStyle = '#4a4f58';
      c.beginPath();
      c.arc(mx, my, ed.cs * 0.2, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#c9ced6';
      c.beginPath();
      c.moveTo(mx, my);
      c.lineTo(mx - ed.cs * 0.25, my - ed.cs * 0.25);
      c.stroke();
      c.fillStyle = '#d9534f';
      c.beginPath();
      c.arc(mx - ed.cs * 0.25, my - ed.cs * 0.25, 4, 0, Math.PI * 2);
      c.fill();
    } else {
      const h = ed.cs * 0.32;
      c.fillStyle = '#2a2622';
      c.fillRect(mx - h, my - h, h * 2, h * 2);
      c.strokeStyle = '#8fe3ff';
      c.lineWidth = 2;
      c.strokeRect(mx - h, my - h, h * 2, h * 2);
    }
    label(cell.ch, '#e0f8ff');
  }
};
