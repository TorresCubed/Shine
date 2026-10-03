import { STEP_DEGREES } from '../content/levels';
import type { LevelOptions, Side, DoorSpec, MirrorSpec } from '../content/levels';
import type { Door, LightKind, Mirror } from '../core/types';

// The editor's model of a level, and conversion to and from the text maps and options in levels.ts.

export type Control = Mirror['control'];
export type Aim = Side;
export type DoorKind = Door['kind'];
// ch: '#' '.' 'S' 'G' 'L' 'F' 'C', 'M' for a mirror, '1'-'9' a trigger (plate or lever).
export type Cell = { ch: string; mirror?: { step: number; control: Control } };
// A door: the edges it sits on ("x,y x,y"), the way it opens, and optionally its hinge end.
type DocDoor = { edges: string[]; opens: Side; hinge?: Side };
export type Doc = {
  grid: Cell[][];
  held: LightKind | null;
  stowed: LightKind[];
  aim: Aim;
  kinds: Record<number, DoorKind>; // per trigger number; light unless set
  doors: Record<number, DocDoor>; // per trigger number
};

export const blank = (w: number, h: number): Doc => {
  const grid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ ch: x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.' })),
  );
  grid[1][1].ch = 'S';
  grid[h - 2][w - 2].ch = 'G';
  return { grid, held: 'candle', stowed: [], aim: 'down', kinds: {}, doors: {} };
};

// An edge's two cells, from "x,y x,y".
export const parseEdge = (edge: string): [[number, number], [number, number]] => {
  const [a, b] = edge
    .trim()
    .split(/\s+/)
    .map(c => c.split(',').map(Number) as [number, number]);
  return [a, b];
};
export const edgeString = (a: [number, number], b: [number, number]) => `${a[0]},${a[1]} ${b[0]},${b[1]}`;

export const fromSource = (map: string[], options: LevelOptions): Doc => {
  const width = Math.max(...map.map(r => r.length));
  const kinds: Record<number, DoorKind> = {};
  const doors: Record<number, DocDoor> = {};
  for (const [ns, spec] of Object.entries(options.doors ?? {})) {
    const n = Number(ns);
    if (typeof spec === 'string') {
      kinds[n] = spec;
      continue;
    }
    kinds[n] = spec.kind ?? 'light';
    doors[n] = {
      edges: typeof spec.between === 'string' ? [spec.between] : [...spec.between],
      opens: spec.opens,
      ...(spec.hinge ? { hinge: spec.hinge } : {}),
    };
  }
  const grid = map.map((row, y) =>
    Array.from({ length: width }, (_, x): Cell => {
      const ch = row[x] ?? '#';
      const key = `${x},${y}`;
      const m = options.mirrors?.[key];
      if (ch === '|')
        return { ch: 'M', mirror: { step: (m?.angle ?? 90) / STEP_DEGREES, control: m?.control ?? 'fixed' } };
      if (ch === 'P') return { ch: '1' };
      return { ch };
    }),
  );
  return {
    grid,
    kinds,
    doors,
    held: options.held === undefined ? 'candle' : options.held,
    stowed: [...(options.stowed ?? [])],
    aim: options.aim ?? 'down',
  };
};

// The trigger numbers in use: on the map, or with a door.
export const pairsInUse = (doc: Doc) => {
  const used = new Set<number>(Object.keys(doc.doors).map(Number));
  for (const row of doc.grid) for (const c of row) if (c.ch >= '1' && c.ch <= '9') used.add(Number(c.ch));
  return [...used].sort();
};

export const toSource = (doc: Doc): { map: string[]; options: LevelOptions } => {
  const mirrors: Record<string, MirrorSpec> = {};
  const map = doc.grid.map((row, y) =>
    row
      .map((c, x) => {
        if (!c.mirror) return c.ch;
        const { step, control } = c.mirror;
        mirrors[`${x},${y}`] =
          control === 'fixed' ? { angle: step * STEP_DEGREES } : { angle: step * STEP_DEGREES, control };
        return '|';
      })
      .join(''),
  );
  const options: LevelOptions = {};
  if (doc.held !== 'candle') options.held = doc.held;
  if (doc.stowed.length) options.stowed = doc.stowed;
  if (doc.aim !== 'down') options.aim = doc.aim;
  const doors: Record<number, DoorKind | DoorSpec> = {};
  for (const n of pairsInUse(doc)) {
    const kind = doc.kinds[n] ?? 'light';
    const door = doc.doors[n];
    if (door) {
      doors[n] = {
        ...(kind !== 'light' ? { kind } : {}),
        between: door.edges.length === 1 ? door.edges[0] : door.edges,
        opens: door.opens,
        ...(door.hinge ? { hinge: door.hinge } : {}),
      };
    } else if (kind !== 'light') doors[n] = kind;
  }
  if (Object.keys(doors).length) options.doors = doors;
  if (Object.keys(mirrors).length) options.mirrors = mirrors;
  return { map, options };
};

// Options written the way levels.ts writes them: single quotes, keys bare where they can be.
const formatValue = (v: unknown): string => {
  if (typeof v === 'string') return `'${v}'`;
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (typeof v === 'object') {
    const parts = Object.entries(v as object).map(
      ([k, val]) => `${/^[a-z]\w*$|^\d+$/i.test(k) ? k : `'${k}'`}: ${formatValue(val)}`,
    );
    return `{ ${parts.join(', ')} }`;
  }
  return String(v);
};

// The `level([...], {...});` call to paste into levels.ts (prettier-ignore keeps the map one row per line).
export const exportCode = (doc: Doc) => {
  const { map, options } = toSource(doc);
  const rows = map.map(r => `  ${JSON.stringify(r)},`).join('\n');
  const opts = Object.keys(options).length ? `, ${formatValue(options)}` : '';
  return `// prettier-ignore
level([\n${rows}\n]${opts});`;
};
