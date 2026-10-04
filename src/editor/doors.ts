import { STEP } from '../content/levelFormat';
import type { Side } from '../content/levelFormat';
import type { Level } from '../core/types';
import { doorLeaves } from '../core/util';
import { font } from './cells';
import { edgeString, parseEdge } from './levelCode';
import type { DoorKind } from './levelCode';
import { ed, inBounds } from './model';
import type { Edge } from './model';

// Doors sit on cell edges: finding, adding and removing those edges, and drawing the doors.

const OPPOSITE: Record<Side, Side> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const edgeNear = (px: number, py: number): Edge | null => {
  const x = Math.floor(px / ed.cs);
  const y = Math.floor(py / ed.cs);
  const fx = px / ed.cs - x;
  const fy = py / ed.cs - y;
  const sides: [Side, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['up', fy],
    ['down', 1 - fy],
  ];
  const [side, d] = sides.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (d > 0.3) return null;
  const [dx, dy] = STEP[side];
  if (!inBounds(x, y) || !inBounds(x + dx, y + dy)) return null;
  return { into: [x, y], from: [x + dx, y + dy], opens: OPPOSITE[side] };
};

// Edges as sets of two cells, so "a b" and "b a" match.
const sameEdge = (a: string, b: string) => {
  const [p, q] = parseEdge(a);
  const [r, s] = parseEdge(b);
  const eq = (u: number[], v: number[]) => u[0] === v[0] && u[1] === v[1];
  return (eq(p, r) && eq(q, s)) || (eq(p, s) && eq(q, r));
};

export const doorOnEdge = (edge: string) =>
  Object.entries(ed.doc.doors).find(([, d]) => d.edges.some(e => sameEdge(e, edge)));

// Takes whatever door is on the edge off it. Returns that door's number, or null if there was none.
export const removeDoorEdge = (e: Edge) => {
  const edge = edgeString(e.from, e.into);
  const existing = doorOnEdge(edge);
  if (!existing) return null;
  const [ns, d] = existing;
  const n = Number(ns);
  d.edges = d.edges.filter(x => !sameEdge(x, edge));
  if (!d.edges.length) {
    delete ed.doc.doors[n];
    if (ed.selectedDoor === n) ed.selectedDoor = null;
  }
  return n;
};

// Door tool: puts this pair's door on the edge (opening into the cell clicked), or clicked again, removes it.
export const toggleDoorEdge = (e: Edge) => {
  if (removeDoorEdge(e) === ed.pair) {
    ed.selectedDoor = ed.doc.doors[ed.pair] ? ed.pair : null;
    return;
  }
  const edge = edgeString(e.from, e.into);
  if (ed.doc.doors[ed.pair]) ed.doc.doors[ed.pair].edges.push(edge);
  else ed.doc.doors[ed.pair] = { edges: [edge], opens: e.opens };
  ed.selectedDoor = ed.pair;
  ed.selected = null;
};

// The line on screen along the edge between two neighbouring cells.
export const edgeLine = ([ax, ay]: number[], [bx, by]: number[]) => {
  const ex = Math.max(ax, bx) * ed.cs;
  const ey = Math.max(ay, by) * ed.cs;
  return ax !== bx ? [ex, ay * ed.cs, ex, (ay + 1) * ed.cs] : [ax * ed.cs, ey, (ax + 1) * ed.cs, ey];
};

const DOOR_COLORS: Record<DoorKind, string> = { light: '#7a5230', lever: '#5a6270', locked: '#8a2e24' };

// Each door's leaves (open if the preview's light opens it), swing arc and number. From the built level
// when valid; otherwise just its edges.
export const drawDoors = (c: CanvasRenderingContext2D) => {
  const triggerOf = (d: Level['doors'][number]) => Number(ed.doc.grid[d.trigger.gridY]?.[d.trigger.gridX]?.ch);
  const leaf = (x1: number, y1: number, x2: number, y2: number, color: string, n: number) => {
    c.strokeStyle = n === ed.selectedDoor ? '#f5c542' : color;
    c.lineWidth = ed.cs * 0.14;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const number = (x: number, y: number, n: number) => {
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(x - 7, y - 7, 14, 14);
    c.fillStyle = '#f0e6d6';
    c.font = font(11, true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(n), x, y);
  };
  if (ed.currentLevel) {
    ed.currentLevel.doors.forEach((d, i) => {
      const n = triggerOf(d);
      const color = DOOR_COLORS[d.kind];
      const open = !!ed.traced?.open[i];
      d.leaves.forEach((l, j) => {
        const hx = l.hinge.x * ed.k;
        const hy = l.hinge.y * ed.k;
        c.strokeStyle = 'rgba(240,230,214,0.45)';
        c.lineWidth = 1;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.arc(hx, hy, ed.cs, Math.min(l.closedAngle, l.openAngle), Math.max(l.closedAngle, l.openAngle));
        c.stroke();
        c.setLineDash([]);
        const s = doorLeaves(d, open ? 1 : 0)[j];
        leaf(s.x1 * ed.k, s.y1 * ed.k, s.x2 * ed.k, s.y2 * ed.k, color, n);
        const closed = doorLeaves(d, 0)[j];
        number(((closed.x1 + closed.x2) / 2) * ed.k, ((closed.y1 + closed.y2) / 2) * ed.k, n);
      });
    });
    return;
  }
  for (const [ns, d] of Object.entries(ed.doc.doors)) {
    const n = Number(ns);
    for (const e of d.edges) {
      const [x1, y1, x2, y2] = edgeLine(...parseEdge(e));
      leaf(x1, y1, x2, y2, DOOR_COLORS[ed.doc.kinds[n] ?? 'light'], n);
      number((x1 + x2) / 2, (y1 + y2) / 2, n);
    }
  }
};
