import { levelSources, fromMap } from "../levels";
import type { Side } from "../levels";
import { doorLeaves } from "../state";
import type { Level, LightKind } from "../interfaces";
import type { LightGroup } from "../rayTracer";
import { GRID_SIZE, LIGHT_FALLOFF_STOPS, LIT_THRESHOLD } from "../consts";
import { blank, fromSource, toSource, exportCode, pairsInUse, parseEdge, edgeString } from "./levelCode";
import type { Cell, Control, Aim, DoorKind, Doc } from "./levelCode";
import { traceLevel } from "./preview";
import type { TryLight, Traced } from "./preview";
import { solve, solverLimits } from "./solver";
import type { Solution } from "./solver";

// A level editor: paint a map, set its mirrors, doors and starting lights, see its light with the
// real ray tracer, find every way to win, playtest it, and export the `level([...], {...})` code to
// paste into levels.ts. Open it at /editor.html.

let CS = 40;               // px per cell on screen (Ctrl+wheel zooms)
let K = CS / GRID_SIZE;    // screen px per world px
const MIN_CS = 12, MAX_CS = 160;
const font = (px: number, bold = false) => `${bold ? 'bold ' : ''}${Math.max(6, px * CS / 40)}px system-ui`; // text sized for 40px cells, zoomed
const STORE_KEY = 'shine-editor';

const TOOLS = [
  ['select', 'Select'], ['floor', 'Floor'], ['wall', 'Wall'], ['start', 'Start'], ['goal', 'Goal'],
  ['lamp', 'Lamp'], ['flashlight', 'Flashlight'], ['candle', 'Candle'], ['mirror', 'Mirror'],
  ['plate', 'Plate'], ['lever', 'Lever'], ['door', 'Door'],
] as const;
const TRY_TOOLS = [['tryFlashlight', 'Flashlight'], ['tryCandle', 'Candle']] as const;
type Tool = typeof TOOLS[number][0] | typeof TRY_TOOLS[number][0];
type ViewMode = 'plain' | 'fog' | 'bright';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('grid');
const ctx = canvas.getContext('2d')!;
// Offscreen layers: the map as drawn, each light's reach, and all of it added up as a mask.
const mapLayer = document.createElement('canvas'), mapCtx = mapLayer.getContext('2d')!;
const groupLayer = document.createElement('canvas'), groupCtx = groupLayer.getContext('2d')!;
const maskLayer = document.createElement('canvas'), maskCtx = maskLayer.getContext('2d')!;
const tintLayer = document.createElement('canvas'), tintCtx = tintLayer.getContext('2d')!;

let doc: Doc = blank(12, 8);
let tries: TryLight[] = [];               // lights put down to try things; never exported
let tool: Tool = 'wall';
let pair = 1;
let view: ViewMode = 'fog';
let showLine = true, showPlates = true, showHeld = false;
let selected: { x: number; y: number } | null = null;
let selectedDoor: number | null = null; // a door, by its trigger number
let hoverEdge: Edge | null = null;
let hover: { x: number; y: number } | null = null;
let painting: 'paint' | 'erase' | null = null;
let preview: Record<string, number> | null = null; // mirror steps from a clicked solution
let traced: Traced | null = null;
let fearLine: [number, number, number, number][] = []; // segments of the 15% line, in cells
let solutions: Solution[] = [];
let picked = -1;
let solving = false, stopSolving = false;
let solvedFor = ''; // the level the solutions are for
let currentLevel: Level | null = null;

const levelKey = () => JSON.stringify(toSource(doc));

// ---- Editing ----

// A cell edge near the mouse: the edge between cell `into` (the one the mouse is in) and the
// neighbour on `side`. A door placed there opens into `into`.
type Edge = { into: [number, number]; from: [number, number]; opens: Side };
const OPPOSITE: Record<Side, Side> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const STEP: Record<Side, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const edgeNear = (px: number, py: number): Edge | null => {
  const x = Math.floor(px / CS), y = Math.floor(py / CS), fx = px / CS - x, fy = py / CS - y;
  const sides: [Side, number][] = [['left', fx], ['right', 1 - fx], ['up', fy], ['down', 1 - fy]];
  const [side, d] = sides.reduce((a, b) => b[1] < a[1] ? b : a);
  if (d > 0.3) return null;
  const [dx, dy] = STEP[side];
  if (!inBounds(x, y) || !inBounds(x + dx, y + dy)) return null;
  return { into: [x, y], from: [x + dx, y + dy], opens: OPPOSITE[side] };
}
// Edges as sets of two cells, so "a b" and "b a" match.
const sameEdge = (a: string, b: string) => {
  const [p, q] = parseEdge(a), [r, s] = parseEdge(b);
  const eq = (u: number[], v: number[]) => u[0] === v[0] && u[1] === v[1];
  return (eq(p, r) && eq(q, s)) || (eq(p, s) && eq(q, r));
}
const doorOnEdge = (edge: string) => Object.entries(doc.doors).find(([, d]) => d.edges.some(e => sameEdge(e, edge)));

// Door tool: puts this pair's door on the edge (opening into the cell clicked), or takes it off.
const toggleDoorEdge = (e: Edge) => {
  const edge = edgeString(e.from, e.into);
  const existing = doorOnEdge(edge);
  if (existing) {
    const [n, d] = existing;
    d.edges = d.edges.filter(x => !sameEdge(x, edge));
    if (!d.edges.length) delete doc.doors[Number(n)];
    if (Number(n) === pair) { selectedDoor = doc.doors[pair] ? pair : null; return; } // clicking it again takes it off
  }
  if (doc.doors[pair]) doc.doors[pair].edges.push(edge);
  else doc.doors[pair] = { edges: [edge], opens: e.opens };
  selectedDoor = pair;
  selected = null;
}

const removeDoorEdge = (e: Edge) => {
  const edge = edgeString(e.from, e.into), existing = doorOnEdge(edge);
  if (!existing) return false;
  const [n, d] = existing;
  d.edges = d.edges.filter(x => !sameEdge(x, edge));
  if (!d.edges.length) { delete doc.doors[Number(n)]; if (selectedDoor === Number(n)) selectedDoor = null; }
  return true;
}

const inBounds = (x: number, y: number) => y >= 0 && y < doc.grid.length && x >= 0 && x < doc.grid[0].length;
const tryAt = (x: number, y: number) => tries.findIndex(t => t.x === x && t.y === y);

const clearChar = (ch: string) => {
  for (const row of doc.grid) for (const c of row) if (c.ch === ch) { c.ch = '.'; delete c.mirror; }
}

// What a newly placed mirror starts as: the last one you set up. A new try-flashlight's aim likewise.
let mirrorDefaults: { step: number; control: Control } = { step: 0, control: 'fixed' };
let lastAim = 0;

const paint = (x: number, y: number, erase: boolean) => {
  if (!inBounds(x, y)) return;
  const c = doc.grid[y][x];
  if (erase) {
    const t = tryAt(x, y);
    if (t >= 0) { tries.splice(t, 1); return; } // a try-light comes off first
    c.ch = '.'; delete c.mirror;
    return;
  }
  if (tool === 'select') { selected = { x, y }; selectedDoor = null; return; }
  if (tool === 'door') return; // doors go on edges: see the mouse handlers
  if (tool === 'tryFlashlight' || tool === 'tryCandle') {
    const t = tryAt(x, y);
    if (t >= 0) tries.splice(t, 1);
    tries.push({ kind: tool === 'tryFlashlight' ? 'flashlight' : 'candle', x, y, aim: lastAim });
    selected = { x, y };
    return;
  }
  delete c.mirror;
  switch (tool) {
    case 'floor': c.ch = '.'; break;
    case 'wall': c.ch = '#'; break;
    case 'start': clearChar('S'); c.ch = 'S'; break;
    case 'goal': clearChar('G'); c.ch = 'G'; break;
    case 'lamp': c.ch = 'L'; break;
    case 'flashlight': c.ch = 'F'; break;
    case 'candle': c.ch = 'C'; break;
    case 'mirror':
      c.ch = 'M';
      c.mirror = { ...mirrorDefaults };
      selected = { x, y };
      break;
    case 'plate': case 'lever':
      clearChar(String(pair)); // a pair has one trigger
      c.ch = String(pair);
      if (tool === 'lever') doc.kinds[pair] = 'lever';
      else if (doc.kinds[pair] === 'lever') doc.kinds[pair] = 'light';
      selected = { x, y };
      break;
  }
}

const resize = (edge: string) => {
  const g = doc.grid, w = g[0].length, h = g.length;
  const wallRow = () => Array.from({ length: g[0].length }, () => ({ ch: '#' }));
  const shift = (dx: number, dy: number) => {
    if (selected) selected = { x: selected.x + dx, y: selected.y + dy };
    for (const t of tries) { t.x += dx; t.y += dy; }
    for (const d of Object.values(doc.doors)) d.edges = d.edges.map(e => {
      const [[ax, ay], [bx, by]] = parseEdge(e);
      return edgeString([ax + dx, ay + dy], [bx + dx, by + dy]);
    });
    preview = null; // its keys are cell positions
  };
  if (edge === 'top+') { g.unshift(wallRow()); shift(0, 1); }
  if (edge === 'bottom+') g.push(wallRow());
  if (edge === 'left+') { for (const r of g) r.unshift({ ch: '#' }); shift(1, 0); }
  if (edge === 'right+') for (const r of g) r.push({ ch: '#' });
  if (edge === 'top-' && h > 3) { g.shift(); shift(0, -1); }
  if (edge === 'bottom-' && h > 3) g.pop();
  if (edge === 'left-' && w > 3) { for (const r of g) r.shift(); shift(-1, 0); }
  if (edge === 'right-' && w > 3) for (const r of g) r.pop();
  if (selected && !inBounds(selected.x, selected.y)) selected = null;
  tries = tries.filter(t => inBounds(t.x, t.y));
  for (const [n, d] of Object.entries(doc.doors)) {
    d.edges = d.edges.filter(e => parseEdge(e).every(([x, y]) => inBounds(x, y)));
    if (!d.edges.length) delete doc.doors[Number(n)];
  }
}

// ---- The level as the game would build it ----

const buildLevel = (): { level: Level | null; error: string } => {
  try {
    const { map, options } = toSource(doc);
    return { level: fromMap('This level', map, options), error: '' };
  } catch (e) {
    return { level: null, error: (e as Error).message };
  }
}

const AIM_DEGREES: Record<Aim, number> = { right: 0, down: 90, left: 180, up: 270 };
const lightsToTrace = (level: Level): TryLight[] => {
  const lights = [...tries];
  if (showHeld && level.startHeld) {
    lights.push({ kind: level.startHeld, x: level.start.gridX, y: level.start.gridY, aim: AIM_DEGREES[doc.aim] });
  }
  return lights;
}

// The 15% line: brightness sampled 4 times per cell, with an edge wherever a lit sample meets an unlit one.
const traceFearLine = (t: Traced) => {
  const n = 4, cols = doc.grid[0].length * n, rows = doc.grid.length * n, s = 1 / n;
  const lit: boolean[][] = [];
  for (let j = 0; j < rows; j++) {
    lit.push([]);
    for (let i = 0; i < cols; i++) lit[j].push(t.at({ x: (i + 0.5) * s * GRID_SIZE, y: (j + 0.5) * s * GRID_SIZE }) >= LIT_THRESHOLD);
  }
  const segs: [number, number, number, number][] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (i + 1 < cols && lit[j][i] !== lit[j][i + 1]) segs.push([(i + 1) * s, j * s, (i + 1) * s, (j + 1) * s]);
    if (j + 1 < rows && lit[j][i] !== lit[j + 1][i]) segs.push([i * s, (j + 1) * s, (i + 1) * s, (j + 1) * s]);
  }
  return segs;
}

// ---- Drawing ----

const DOOR_COLORS: Record<DoorKind, string> = { light: '#7a5230', lever: '#5a6270', locked: '#8a2e24' };

const drawFlashlightGlyph = (c: CanvasRenderingContext2D, mx: number, my: number, angle: number, lit: boolean) => {
  c.save();
  c.translate(mx, my);
  c.rotate(angle);
  c.fillStyle = '#3b3f46'; c.fillRect(-CS * 0.28, -CS * 0.07, CS * 0.4, CS * 0.14);
  c.fillStyle = '#555b64'; c.fillRect(CS * 0.1, -CS * 0.12, CS * 0.14, CS * 0.24);
  c.fillStyle = lit ? '#fff6c8' : '#9aa3ab'; c.fillRect(CS * 0.24, -CS * 0.1, CS * 0.04, CS * 0.2);
  c.restore();
}
const drawCandleGlyph = (c: CanvasRenderingContext2D, mx: number, my: number) => {
  c.fillStyle = '#e8e0d0'; c.fillRect(mx - CS * 0.07, my - CS * 0.05, CS * 0.14, CS * 0.28);
  c.fillStyle = '#ffb347'; c.beginPath(); c.ellipse(mx, my - CS * 0.14, CS * 0.07, CS * 0.12, 0, 0, Math.PI * 2); c.fill();
}

const drawCell = (c: CanvasRenderingContext2D, x: number, y: number, cell: Cell) => {
  const px = x * CS, py = y * CS, mx = px + CS / 2, my = py + CS / 2;
  c.fillStyle = cell.ch === '#' ? '#2b2520' : '#5c4a36';
  c.fillRect(px, py, CS, CS);
  c.lineWidth = 3;
  const label = (text: string, color: string) => {
    c.fillStyle = color;
    c.font = font(14, true);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, mx, my);
  };
  if (cell.ch === 'S') { c.strokeStyle = '#e8e0d0'; c.beginPath(); c.arc(mx, my, CS * 0.33, 0, Math.PI * 2); c.stroke(); label('S', '#e8e0d0'); }
  else if (cell.ch === 'G') {
    const r = CS * 0.32;
    c.strokeStyle = '#f5c542';
    c.beginPath(); c.moveTo(mx, my - r); c.lineTo(mx + r, my); c.lineTo(mx, my + r); c.lineTo(mx - r, my); c.closePath(); c.stroke();
  }
  else if (cell.ch === 'L') {
    // The lamp hangs on the first neighbouring wall (up, right, down, left), as in the game.
    const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dx, dy]) => doc.grid[y + dy]?.[x + dx]?.ch === '#');
    c.fillStyle = '#ffd27a';
    c.beginPath();
    if (side) {
      const ex = mx + side[0] * CS / 2, ey = my + side[1] * CS / 2, facing = Math.atan2(-side[1], -side[0]);
      c.arc(ex, ey, CS * 0.22, facing - Math.PI / 2, facing + Math.PI / 2);
    } else c.arc(mx, my, CS * 0.2, 0, Math.PI * 2);
    c.fill();
    if (!side) label('!', '#e06a55');
  }
  else if (cell.ch === 'F') drawFlashlightGlyph(c, mx, my, 0, false);
  else if (cell.ch === 'C') drawCandleGlyph(c, mx, my);
  else if (cell.mirror) {
    const key = `${x},${y}`, previewed = preview?.[key] !== undefined;
    const step = previewed ? preview![key] : cell.mirror.step;
    const a = step * Math.PI / 8, dx = Math.cos(a) * CS * 0.35, dy = Math.sin(a) * CS * 0.35;
    c.strokeStyle = previewed ? '#f5c542' : '#dff2ff'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(mx - dx, my - dy); c.lineTo(mx + dx, my + dy); c.stroke();
    const ctl = cell.mirror.control;
    c.fillStyle = '#8a93a0';
    if (ctl === 'turnable') { c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.fill(); }
    else if (typeof ctl === 'number') {
      c.fillRect(mx - 5, my - 5, 10, 10);
      c.fillStyle = '#e8e0d0'; c.font = font(11, true); c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(String(ctl), px + 3, py + 2);
    }
  }
  else if (cell.ch >= '1' && cell.ch <= '9') {
    const n = Number(cell.ch);
    if (doc.kinds[n] === 'lever') {
      c.fillStyle = '#4a4f58'; c.beginPath(); c.arc(mx, my, CS * 0.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c9ced6'; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx - CS * 0.25, my - CS * 0.25); c.stroke();
      c.fillStyle = '#d9534f'; c.beginPath(); c.arc(mx - CS * 0.25, my - CS * 0.25, 4, 0, Math.PI * 2); c.fill();
    } else {
      const h = CS * 0.32;
      c.fillStyle = '#2a2622'; c.fillRect(mx - h, my - h, h * 2, h * 2);
      c.strokeStyle = '#8fe3ff'; c.lineWidth = 2; c.strokeRect(mx - h, my - h, h * 2, h * 2);
    }
    label(cell.ch, '#e0f8ff');
  }
}

// Doors: each leaf where it is (open if the preview's light opens it), its swing as a dashed arc,
// and its trigger number. Built from the level when it's valid; otherwise just its edges.
const drawDoors = (c: CanvasRenderingContext2D) => {
  const triggerOf = (d: Level['doors'][number]) => Number(doc.grid[d.trigger.gridY]?.[d.trigger.gridX]?.ch);
  const leaf = (x1: number, y1: number, x2: number, y2: number, color: string, n: number) => {
    c.strokeStyle = n === selectedDoor ? '#f5c542' : color;
    c.lineWidth = CS * 0.14;
    c.lineCap = 'butt';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  };
  const number = (x: number, y: number, n: number) => {
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(x - 7, y - 7, 14, 14);
    c.fillStyle = '#f0e6d6'; c.font = font(11, true); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), x, y);
  };
  if (currentLevel) {
    currentLevel.doors.forEach((d, i) => {
      const n = triggerOf(d), color = DOOR_COLORS[d.kind], open = !!traced?.open[i];
      d.leaves.forEach((l, j) => {
        const hx = l.hinge.x * K, hy = l.hinge.y * K;
        c.strokeStyle = 'rgba(240,230,214,0.45)'; c.lineWidth = 1; c.setLineDash([3, 3]);
        c.beginPath(); c.arc(hx, hy, CS, Math.min(l.closedAngle, l.openAngle), Math.max(l.closedAngle, l.openAngle)); c.stroke();
        c.setLineDash([]);
        const s = doorLeaves(d, open ? 1 : 0)[j];
        leaf(s.x1 * K, s.y1 * K, s.x2 * K, s.y2 * K, color, n);
        const closed = doorLeaves(d, 0)[j];
        number((closed.x1 + closed.x2) / 2 * K, (closed.y1 + closed.y2) / 2 * K, n);
      });
    });
    return;
  }
  for (const [ns, d] of Object.entries(doc.doors)) {
    const n = Number(ns);
    for (const e of d.edges) {
      const [[ax, ay], [bx, by]] = parseEdge(e);
      const vertical = ax !== bx, ex = Math.max(ax, bx) * CS, ey = Math.max(ay, by) * CS;
      const [x1, y1, x2, y2] = vertical ? [ex, ay * CS, ex, (ay + 1) * CS] : [ax * CS, ey, (ax + 1) * CS, ey];
      leaf(x1, y1, x2, y2, DOOR_COLORS[doc.kinds[n] ?? 'light'], n);
      number((x1 + x2) / 2, (y1 + y2) / 2, n);
    }
  }
}

// Each light's reach, faded by its falloff, all added into maskLayer (white, alpha = brightness).
const drawLightMask = (groups: LightGroup[]) => {
  maskCtx.clearRect(0, 0, maskLayer.width, maskLayer.height);
  for (const g of groups) {
    groupCtx.setTransform(1, 0, 0, 1, 0, 0);
    groupCtx.clearRect(0, 0, groupLayer.width, groupLayer.height);
    groupCtx.setTransform(K, 0, 0, K, 0, 0);
    groupCtx.fillStyle = '#fff';
    groupCtx.beginPath();
    for (const poly of g.polys) {
      groupCtx.moveTo(poly[0].x, poly[0].y);
      for (const p of poly) groupCtx.lineTo(p.x, p.y);
      groupCtx.closePath();
    }
    groupCtx.fill();
    groupCtx.globalCompositeOperation = 'destination-in';
    const falloff = groupCtx.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, g.radius);
    for (const [t, v] of LIGHT_FALLOFF_STOPS) falloff.addColorStop(t, `rgba(255,255,255,${v})`);
    groupCtx.fillStyle = falloff;
    groupCtx.fillRect(0, 0, groupLayer.width / K, groupLayer.height / K);
    groupCtx.globalCompositeOperation = 'source-over';
    maskCtx.globalCompositeOperation = 'lighter';
    maskCtx.drawImage(groupLayer, 0, 0);
  }
  maskCtx.globalCompositeOperation = 'source-over';
}

// `color` (or the map itself, when null) wherever there's light, at the light's strength.
const tinted = (color: string | null) => {
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.clearRect(0, 0, tintLayer.width, tintLayer.height);
  if (color) { tintCtx.fillStyle = color; tintCtx.fillRect(0, 0, tintLayer.width, tintLayer.height); }
  else tintCtx.drawImage(mapLayer, 0, 0);
  tintCtx.globalCompositeOperation = 'destination-in';
  tintCtx.drawImage(maskLayer, 0, 0);
  tintCtx.globalCompositeOperation = 'source-over';
  return tintLayer;
}

let lightDirty = true;
const draw = () => {
  const g = doc.grid, w = g[0].length * CS, h = g.length * CS;
  for (const c of [canvas, mapLayer, groupLayer, maskLayer, tintLayer]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; lightDirty = true; }
  const level = traced ? currentLevel : null;
  g.forEach((row, y) => row.forEach((cell, x) => drawCell(mapCtx, x, y, cell)));
  drawDoors(mapCtx);

  if (view === 'plain' || !traced) ctx.drawImage(mapLayer, 0, 0);
  else {
    if (lightDirty) { drawLightMask(traced.groups); lightDirty = false; }
    if (view === 'fog') {
      // The map dimmed and grayed like fog memory, with lit areas showing through at full colour.
      ctx.filter = 'grayscale(1) brightness(0.45)';
      ctx.drawImage(mapLayer, 0, 0);
      ctx.filter = 'none';
      ctx.drawImage(tinted(null), 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(tinted('rgb(255, 220, 150)'), 0, 0);
    } else {
      ctx.drawImage(mapLayer, 0, 0);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(tinted('rgb(90, 200, 255)'), 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  if (traced && view !== 'plain' && showLine) {
    ctx.strokeStyle = '#b6ff5c'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of fearLine) { ctx.moveTo(x1 * CS, y1 * CS); ctx.lineTo(x2 * CS, y2 * CS); }
    ctx.stroke();
  }
  if (traced && level && view !== 'plain' && showPlates) {
    level.doors.forEach((d, i) => {
      if (d.kind === 'lever') return;
      const v = traced!.plates[i], lit = v >= LIT_THRESHOLD, px = d.trigger.gridX * CS, py = d.trigger.gridY * CS;
      ctx.strokeStyle = lit ? '#7cc47a' : '#e06a55'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, CS - 4, CS - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(px + 2, py + CS * 0.675, CS - 4, CS * 0.275);
      ctx.fillStyle = lit ? '#b6ff5c' : '#f0e6d6'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${Math.round(v * 100)}%`, px + CS / 2, py + CS - 2);
    });
  }

  // Try-lights, ringed so they don't look like part of the level.
  for (const t of tries) {
    const mx = (t.x + 0.5) * CS, my = (t.y + 0.5) * CS;
    ctx.strokeStyle = '#ff7ad9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, CS * 0.44, 0, Math.PI * 2); ctx.stroke();
    if (t.kind === 'flashlight') drawFlashlightGlyph(ctx, mx, my, t.aim * Math.PI / 180, true);
    else drawCandleGlyph(ctx, mx, my);
  }

  // Grid lines, then the hovered and selected cells.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let x = 0; x <= g[0].length; x++) { ctx.beginPath(); ctx.moveTo(x * CS + 0.5, 0); ctx.lineTo(x * CS + 0.5, h); ctx.stroke(); }
  for (let y = 0; y <= g.length; y++) { ctx.beginPath(); ctx.moveTo(0, y * CS + 0.5); ctx.lineTo(w, y * CS + 0.5); ctx.stroke(); }
  if (hover && !hoverEdge) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(hover.x * CS + 1, hover.y * CS + 1, CS - 2, CS - 2); }
  if (hoverEdge) {
    // The edge a door would go on, with a tick pointing into the cell it would open into.
    const [ix, iy] = hoverEdge.into, [fx, fy] = hoverEdge.from;
    const vertical = ix !== fx, ex = Math.max(ix, fx) * CS, ey = Math.max(iy, fy) * CS;
    const [x1, y1, x2, y2] = vertical ? [ex, iy * CS, ex, (iy + 1) * CS] : [ix * CS, ey, (ix + 1) * CS, ey];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(mx, my); ctx.lineTo(mx + (ix - fx) * CS * 0.25, my + (iy - fy) * CS * 0.25);
    ctx.stroke();
  }
  if (selected) { ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.strokeRect(selected.x * CS + 1, selected.y * CS + 1, CS - 2, CS - 2); }
}

// ---- Panels ----

const addToolButtons = (el: HTMLElement, list: readonly (readonly [Tool, string])[]) => {
  for (const [id, name] of list) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.tool = id;
    b.onclick = () => { tool = id; refresh(); };
    el.appendChild(b);
  }
}
addToolButtons($('tools'), TOOLS);
addToolButtons($('tryTools'), TRY_TOOLS);

const pairSelect = $<HTMLSelectElement>('pairSelect');
for (let n = 1; n <= 9; n++) pairSelect.add(new Option(`${n} (door ${String.fromCharCode(96 + n)})`, String(n)));
pairSelect.onchange = () => { pair = Number(pairSelect.value); };

const levelSelect = $<HTMLSelectElement>('levelSelect');
levelSelect.add(new Option('New blank level', 'new'));
levelSources.forEach((_, i) => levelSelect.add(new Option(`Level ${i + 1}`, String(i))));
$('openBtn').onclick = () => {
  const v = levelSelect.value;
  doc = v === 'new' ? blank(12, 8) : fromSource(levelSources[Number(v)].map, levelSources[Number(v)].options);
  tries = [];
  selected = null;
  clearSolutions();
  refresh();
};

const held = $<HTMLSelectElement>('held');
const stowCandle = $<HTMLInputElement>('stowCandle');
const stowFlashlight = $<HTMLInputElement>('stowFlashlight');
const aim = $<HTMLSelectElement>('aim');
held.onchange = () => { doc.held = (held.value || null) as LightKind | null; refresh(); };
const setStowed = () => {
  doc.stowed = [...(stowCandle.checked ? ['candle' as const] : []), ...(stowFlashlight.checked ? ['flashlight' as const] : [])];
  refresh();
};
stowCandle.onchange = setStowed;
stowFlashlight.onchange = setStowed;
aim.onchange = () => { doc.aim = aim.value as Aim; refresh(); };

const viewSelect = $<HTMLSelectElement>('viewMode');
viewSelect.onchange = () => { view = viewSelect.value as ViewMode; refresh(); };
$<HTMLInputElement>('showLine').onchange = e => { showLine = (e.target as HTMLInputElement).checked; draw(); };
$<HTMLInputElement>('showPlates').onchange = e => { showPlates = (e.target as HTMLInputElement).checked; draw(); };
$<HTMLInputElement>('showHeld').onchange = e => { showHeld = (e.target as HTMLInputElement).checked; refresh(); };

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-resize]')) b.onclick = () => { resize(b.dataset.resize!); refresh(); };

$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(exportCode(doc)); $('copyHint').textContent = 'Copied.'; }
  catch { $<HTMLTextAreaElement>('code').select(); $('copyHint').textContent = 'Selected: copy with Ctrl+C.'; }
};

const playtest = (mode: 'fog' | 'bright') => {
  const { level, error } = buildLevel();
  if (!level) { alert(`Fix this first: ${error}`); return; }
  localStorage.setItem('shine-playtest', JSON.stringify(toSource(doc)));
  window.open(`/?playtest&view=${mode}`, 'shine-playtest');
}
$('playFog').onclick = () => playtest('fog');
$('playBright').onclick = () => playtest('bright');

// ---- Solving ----

const clearSolutions = () => {
  stopSolving = true;
  solutions = [];
  picked = -1;
  preview = null;
  $('solutions').innerHTML = '';
  $('solveStatus').textContent = '';
}

const describe = (s: Solution) => {
  const mirrors = Object.entries(s.steps).map(([k, v]) => `(${k}) at ${v * 22.5}°`).join(', ');
  const aims = s.aims.length > 1 ? `${s.aims[0]}–${s.aims[s.aims.length - 1]}°` : `${s.aims[0]}°`;
  return `${mirrors ? `Mirrors ${mirrors}; ` : ''}drop at (${s.x},${s.y}) aimed ${aims}`;
}

const showSolution = (i: number) => {
  picked = i;
  const s = solutions[i];
  preview = s.steps;
  tries = [{ kind: 'flashlight', x: s.x, y: s.y, aim: s.aims[Math.floor(s.aims.length / 2)] }];
  if (view === 'plain') view = 'fog';
  refresh();
}

const renderSolutions = () => {
  const el = $('solutions');
  el.innerHTML = '';
  solutions.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}. ${describe(s)}`;
    if (i === picked) b.className = 'on';
    b.onclick = () => showSolution(i);
    el.appendChild(b);
  });
}

$('solveBtn').onclick = async () => {
  if (solving) { stopSolving = true; return; }
  const { level, error } = buildLevel();
  const status = $('solveStatus');
  if (!level) { status.textContent = `Fix this first: ${error}`; return; }
  const limits = solverLimits(level);
  if (limits) { status.textContent = limits; return; }
  clearSolutions();
  solvedFor = levelKey();
  solving = true;
  stopSolving = false;
  $('solveBtn').textContent = 'Stop';
  const found = await solve(level, (done, total) => { status.textContent = `${Math.round(done / total * 100)}%`; }, () => stopSolving);
  solving = false;
  $('solveBtn').textContent = 'Find every way to win';
  if (levelKey() !== solvedFor) return; // edited while solving: these are for an older level
  solutions = found;
  status.textContent = stopSolving ? `Stopped: ${solutions.length} found so far.`
    : solutions.length === 0 ? 'No way to win found.'
    : solutions.length === 1 ? 'Exactly one way to win.'
    : `${solutions.length} ways to win.`;
  renderSolutions();
};
$('clearPreview').onclick = () => { preview = null; picked = -1; renderSolutions(); refresh(); };

// The Selected panel: a mirror's angle and control, a pair's door kind, or a try-flashlight's aim.
const button = (text: string, on: boolean, onClick: () => void) => {
  const b = document.createElement('button');
  b.textContent = text;
  if (on) b.className = 'on';
  b.onclick = onClick;
  return b;
}
const row = (...items: (string | Node)[]) => {
  const r = document.createElement('div');
  r.className = 'row';
  r.append(...items);
  return r;
}

const renderProps = () => {
  const el = $('props');
  el.innerHTML = '';
  el.className = '';
  const door = selectedDoor !== null ? doc.doors[selectedDoor] : undefined;
  if (door && selectedDoor !== null) { renderDoorProps(el, selectedDoor, door); return; }
  const c = selected && doc.grid[selected.y]?.[selected.x];
  if (!selected || !c) { el.className = 'hint'; el.textContent = 'Nothing selected.'; return; }
  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `Cell ${selected.x},${selected.y}`;
  el.appendChild(head);

  const t = tries[tryAt(selected.x, selected.y)];
  if (t) {
    if (t.kind === 'flashlight') {
      const dirs: [string, number][] = [['→', 0], ['↘', 45], ['↓', 90], ['↙', 135], ['←', 180], ['↖', 225], ['↑', 270], ['↗', 315]];
      const setAim = (a: number) => { t.aim = ((a % 360) + 360) % 360; lastAim = t.aim; refresh(); };
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(t.aim);
      input.style.width = '56px';
      input.onchange = () => setAim(Number(input.value) || 0);
      el.append(
        row('Try flashlight, aimed', ...dirs.map(([s, a]) => button(s, t.aim === a, () => setAim(a)))),
        row(button('−5°', false, () => setAim(t.aim - 5)), input, '°', button('+5°', false, () => setAim(t.aim + 5))),
      );
    } else el.append(row('Try candle.'));
    el.append(row(button('Remove it', false, () => { tries.splice(tries.indexOf(t), 1); refresh(); })));
    return;
  }

  if (c.mirror) {
    const m = c.mirror;
    const angles = row('Angle');
    for (let s = 0; s < 8; s++) angles.appendChild(button(`${s * 22.5}°`, s === m.step, () => { m.step = s; mirrorDefaults = { ...m }; refresh(); }));
    const sel = document.createElement('select');
    sel.add(new Option('nothing (fixed)', 'fixed'));
    sel.add(new Option('the player (Space)', 'turnable'));
    const levers = pairsInUse(doc).filter(n => doc.kinds[n] === 'lever');
    for (const n of levers) sel.add(new Option(`lever ${n}`, String(n)));
    if (typeof m.control === 'number' && !levers.includes(m.control)) sel.add(new Option(`lever ${m.control} (missing!)`, String(m.control)));
    sel.value = String(m.control);
    sel.onchange = () => {
      m.control = sel.value === 'fixed' || sel.value === 'turnable' ? sel.value : Number(sel.value);
      mirrorDefaults = { ...m };
      refresh();
    };
    el.append(angles, row('Turned by', sel));
    if (preview?.[`${selected.x},${selected.y}`] !== undefined) {
      el.append(row(`Shown at ${preview[`${selected.x},${selected.y}`] * 22.5}° for the solution preview.`));
    }
    return;
  }

  const n = c.ch >= '1' && c.ch <= '9' ? Number(c.ch) : 0;
  if (!n) { el.appendChild(document.createTextNode('Nothing to set here.')); return; }
  const what = doc.kinds[n] === 'lever' ? 'Lever' : 'Plate';
  el.append(row(doc.doors[n]
    ? `${what} ${n}: works door ${n}. Select the door to set it up.`
    : doc.kinds[n] === 'lever' ? `Lever ${n}: no door, so it only turns mirrors.` : `Plate ${n}: no door yet. Use the Door tool with pair ${n}.`));
}

// A door's settings: which way it opens, its hinge, and what kind it is.
const renderDoorProps = (el: HTMLElement, n: number, door: Doc['doors'][number]) => {
  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `Door ${n}: ${door.edges.length} leaf${door.edges.length > 1 ? 'ves' : ''}`;
  el.appendChild(head);
  const [[ax], [bx]] = parseEdge(door.edges[0]);
  const across = ax === bx; // the edge runs left-right, so the door opens up or down
  const opens = document.createElement('select');
  for (const s of (across ? ['up', 'down'] : ['left', 'right']) as Side[]) opens.add(new Option(s, s));
  opens.value = door.opens;
  opens.onchange = () => { door.opens = opens.value as Side; refresh(); };
  const hinge = document.createElement('select');
  hinge.add(new Option('the end against a wall', ''));
  for (const s of (across ? ['left', 'right'] : ['up', 'down']) as Side[]) hinge.add(new Option(`the ${s} end`, s));
  hinge.value = door.hinge ?? '';
  hinge.onchange = () => { if (hinge.value) door.hinge = hinge.value as Side; else delete door.hinge; refresh(); };
  el.append(row('Opens', opens), row('Hinged at', hinge));
  if (doc.kinds[n] === 'lever') el.append(row(`Worked by lever ${n}.`));
  else {
    const kind = document.createElement('select');
    kind.add(new Option('light door (open while lit)', 'light'));
    kind.add(new Option('locked door (opens for good)', 'locked'));
    kind.value = doc.kinds[n] === 'locked' ? 'locked' : 'light';
    kind.onchange = () => { doc.kinds[n] = kind.value as DoorKind; refresh(); };
    el.append(row(`Plate ${n}'s`, kind));
  }
  el.append(row(button('Remove door', false, () => { delete doc.doors[n]; selectedDoor = null; refresh(); })));
}

// ---- Keeping everything in step ----

const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ doc, tries })); } catch { /* storage unavailable */ } };
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved?.doc) {
      doc = saved.doc;
      tries = saved.tries ?? [];
      // Saved before doors moved onto edges: drop the old door cells.
      if (!doc.doors) {
        doc.doors = {};
        for (const r of doc.grid) for (const c of r) if ((c.ch >= 'a' && c.ch <= 'i') || c.ch === 'D' || c.ch === 'K') c.ch = '.';
      }
    }
  } catch { /* start blank */ }
};

const refresh = () => {
  // Editing the level makes any solutions out of date.
  if ((solutions.length || solving) && levelKey() !== solvedFor) {
    clearSolutions();
    $('solveStatus').textContent = 'The level changed: solve again.';
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
  $('pairRow').style.display = tool === 'plate' || tool === 'lever' || tool === 'door' ? '' : 'none';
  held.value = doc.held ?? '';
  stowCandle.checked = doc.stowed.includes('candle');
  stowFlashlight.checked = doc.stowed.includes('flashlight');
  aim.value = doc.aim;
  viewSelect.value = view;

  // Build it exactly as the game would, so any mistake shows here, not when the game loads.
  const { level, error } = buildLevel();
  const status = $('status');
  status.className = level ? 'ok' : 'bad';
  status.textContent = level ? 'Valid level.' : error;
  currentLevel = level;
  traced = level && view !== 'plain' ? traceLevel(level, lightsToTrace(level), preview ?? {}) : null;
  fearLine = traced ? traceFearLine(traced) : [];
  lightDirty = true;

  renderProps();
  renderSolutions();
  draw();
  $<HTMLTextAreaElement>('code').value = exportCode(doc);
  save();
}

const pointAt = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}
const cellAt = (e: MouseEvent) => {
  const { px, py } = pointAt(e);
  return { x: Math.floor(px / CS), y: Math.floor(py / CS) };
}
const DRAGGABLE: Tool[] = ['floor', 'wall', 'lamp'];
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  const { x, y } = cellAt(e), { px, py } = pointAt(e), edge = edgeNear(px, py);
  const doorHere = edge ? doorOnEdge(edgeString(edge.from, edge.into)) : undefined;
  if (e.button === 2 && edge && removeDoorEdge(edge)) { refresh(); return; } // a door comes off an edge first
  if (e.button === 0 && tool === 'door') { if (edge) toggleDoorEdge(edge); refresh(); return; }
  if (e.button === 0 && tool === 'select' && doorHere) { selectedDoor = Number(doorHere[0]); selected = null; refresh(); return; }
  painting = e.button === 2 ? 'erase' : 'paint';
  paint(x, y, painting === 'erase');
  refresh();
});
canvas.addEventListener('mousemove', e => {
  const { px, py } = pointAt(e);
  const edge = tool === 'door' ? edgeNear(px, py) : null;
  const edgeChanged = JSON.stringify(edge) !== JSON.stringify(hoverEdge);
  hoverEdge = edge;
  const at = cellAt(e);
  if (hover && at.x === hover.x && at.y === hover.y && !edgeChanged) return;
  hover = at;
  if (painting === 'erase' || (painting === 'paint' && DRAGGABLE.includes(tool))) paint(at.x, at.y, painting === 'erase');
  draw();
});
window.addEventListener('mouseup', () => { if (painting) { painting = null; refresh(); } });
// Ctrl+wheel (or a trackpad pinch) zooms about the mouse; the plain wheel still scrolls.
const main = $('main');
canvas.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const { px, py } = pointAt(e);
  const was = CS;
  CS = Math.min(MAX_CS, Math.max(MIN_CS, CS * Math.exp(-e.deltaY * 0.002)));
  K = CS / GRID_SIZE;
  draw();
  main.scrollLeft += px * (CS / was - 1);
  main.scrollTop += py * (CS / was - 1);
}, { passive: false });
canvas.addEventListener('mouseleave', () => { hover = null; hoverEdge = null; draw(); });

load();
refresh();
