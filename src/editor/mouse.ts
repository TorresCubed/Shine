import { GRID_SIZE } from '../core/consts';
import { doorOnEdge, edgeNear, removeDoorEdge, toggleDoorEdge } from './doors';
import { draw } from './draw';
import { paint } from './edit';
import { edgeString } from './levelCode';
import { $, canvas, ed, page } from './model';
import type { Tool } from './model';

const MIN_CS = 12;
const MAX_CS = 160;
const DRAGGABLE: Tool[] = ['floor', 'wall', 'lamp'];

const pointAt = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
};
const cellAt = (e: MouseEvent) => {
  const { px, py } = pointAt(e);
  return { x: Math.floor(px / ed.cs), y: Math.floor(py / ed.cs) };
};

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const { x, y } = cellAt(e);
  const { px, py } = pointAt(e);
  const edge = edgeNear(px, py);
  const doorHere = edge ? doorOnEdge(edgeString(edge.from, edge.into)) : undefined;
  // Right-click takes a door off an edge before erasing the cell.
  if (e.button === 2 && edge && removeDoorEdge(edge) !== null) {
    page.refresh();
    return;
  }
  if (e.button === 0 && ed.tool === 'door') {
    if (edge) toggleDoorEdge(edge);
    page.refresh();
    return;
  }
  if (e.button === 0 && ed.tool === 'select' && doorHere) {
    ed.selectedDoor = Number(doorHere[0]);
    ed.selected = null;
    page.refresh();
    return;
  }
  ed.painting = e.button === 2 ? 'erase' : 'paint';
  paint(x, y, ed.painting === 'erase');
  page.refresh();
});

canvas.addEventListener('mousemove', e => {
  const { px, py } = pointAt(e);
  const edge = ed.tool === 'door' ? edgeNear(px, py) : null;
  const edgeChanged = JSON.stringify(edge) !== JSON.stringify(ed.hoverEdge);
  ed.hoverEdge = edge;
  const at = cellAt(e);
  if (ed.hover && at.x === ed.hover.x && at.y === ed.hover.y && !edgeChanged) return;
  ed.hover = at;
  if (ed.painting === 'erase' || (ed.painting === 'paint' && DRAGGABLE.includes(ed.tool)))
    paint(at.x, at.y, ed.painting === 'erase');
  draw();
});

window.addEventListener('mouseup', () => {
  if (ed.painting) {
    ed.painting = null;
    page.refresh();
  }
});

canvas.addEventListener('mouseleave', () => {
  ed.hover = null;
  ed.hoverEdge = null;
  draw();
});

// Ctrl+wheel (or a trackpad pinch) zooms about the mouse; the plain wheel scrolls.
const main = $('main');
canvas.addEventListener(
  'wheel',
  e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const { px, py } = pointAt(e);
    const was = ed.cs;
    ed.cs = Math.min(MAX_CS, Math.max(MIN_CS, ed.cs * Math.exp(-e.deltaY * 0.002)));
    ed.k = ed.cs / GRID_SIZE;
    draw();
    main.scrollLeft += px * (ed.cs / was - 1);
    main.scrollTop += py * (ed.cs / was - 1);
  },
  { passive: false },
);
