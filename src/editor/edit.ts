import { edgeString, parseEdge } from './levelCode';
import { ed, inBounds, tryAt } from './model';

// Painting and resizing the map.

const clearChar = (ch: string) => {
  for (const row of ed.doc.grid)
    for (const c of row)
      if (c.ch === ch) {
        c.ch = '.';
        delete c.mirror;
      }
};

export const paint = (x: number, y: number, erase: boolean) => {
  if (!inBounds(x, y)) return;
  const c = ed.doc.grid[y][x];
  if (erase) {
    const t = tryAt(x, y);
    if (t >= 0) {
      ed.tries.splice(t, 1);
      return;
    } // a try-light comes off first
    c.ch = '.';
    delete c.mirror;
    return;
  }
  if (ed.tool === 'select') {
    ed.selected = { x, y };
    ed.selectedDoor = null;
    return;
  }
  if (ed.tool === 'door') return; // doors go on edges: see the mouse handlers
  if (ed.tool === 'tryFlashlight' || ed.tool === 'tryCandle') {
    const t = tryAt(x, y);
    if (t >= 0) ed.tries.splice(t, 1);
    ed.tries.push({ kind: ed.tool === 'tryFlashlight' ? 'flashlight' : 'candle', x, y, aim: ed.lastAim });
    ed.selected = { x, y };
    return;
  }
  delete c.mirror;
  switch (ed.tool) {
    case 'floor':
      c.ch = '.';
      break;
    case 'wall':
      c.ch = '#';
      break;
    case 'start':
      clearChar('S');
      c.ch = 'S';
      break;
    case 'goal':
      clearChar('G');
      c.ch = 'G';
      break;
    case 'lamp':
      c.ch = 'L';
      break;
    case 'flashlight':
      c.ch = 'F';
      break;
    case 'candle':
      c.ch = 'C';
      break;
    case 'mirror':
      c.ch = 'M';
      c.mirror = { ...ed.mirrorDefaults };
      ed.selected = { x, y };
      break;
    case 'plate':
    case 'lever':
      clearChar(String(ed.pair)); // a pair has one trigger
      c.ch = String(ed.pair);
      if (ed.tool === 'lever') ed.doc.kinds[ed.pair] = 'lever';
      else if (ed.doc.kinds[ed.pair] === 'lever') ed.doc.kinds[ed.pair] = 'light';
      ed.selected = { x, y };
      break;
  }
};

export const resize = (edge: string) => {
  const g = ed.doc.grid;
  const w = g[0].length;
  const h = g.length;
  const wallRow = () => Array.from({ length: g[0].length }, () => ({ ch: '#' }));
  const shift = (dx: number, dy: number) => {
    if (ed.selected) ed.selected = { x: ed.selected.x + dx, y: ed.selected.y + dy };
    for (const t of ed.tries) {
      t.x += dx;
      t.y += dy;
    }
    for (const d of Object.values(ed.doc.doors))
      d.edges = d.edges.map(e => {
        const [[ax, ay], [bx, by]] = parseEdge(e);
        return edgeString([ax + dx, ay + dy], [bx + dx, by + dy]);
      });
    ed.preview = null; // its keys are cell positions
  };
  if (edge === 'top+') {
    g.unshift(wallRow());
    shift(0, 1);
  }
  if (edge === 'bottom+') g.push(wallRow());
  if (edge === 'left+') {
    for (const r of g) r.unshift({ ch: '#' });
    shift(1, 0);
  }
  if (edge === 'right+') for (const r of g) r.push({ ch: '#' });
  if (edge === 'top-' && h > 3) {
    g.shift();
    shift(0, -1);
  }
  if (edge === 'bottom-' && h > 3) g.pop();
  if (edge === 'left-' && w > 3) {
    for (const r of g) r.shift();
    shift(-1, 0);
  }
  if (edge === 'right-' && w > 3) for (const r of g) r.pop();
  if (ed.selected && !inBounds(ed.selected.x, ed.selected.y)) ed.selected = null;
  ed.tries = ed.tries.filter(t => inBounds(t.x, t.y));
  for (const [n, d] of Object.entries(ed.doc.doors)) {
    d.edges = d.edges.filter(e => parseEdge(e).every(([x, y]) => inBounds(x, y)));
    if (!d.edges.length) delete ed.doc.doors[Number(n)];
  }
};
