import type { Side } from '../content/levelFormat';
import { GRID_SIZE } from '../core/consts';
import type { Level } from '../core/types';
import { blank, toSource } from './levelCode';
import type { Control, Doc } from './levelCode';
import type { TryLight, Traced } from './preview';
import type { Solution } from './solver';

// The level editor's shared state (open it at /editor.html).

export const TOOLS = [
  ['select', 'Select'],
  ['floor', 'Floor'],
  ['wall', 'Wall'],
  ['start', 'Start'],
  ['goal', 'Goal'],
  ['lamp', 'Lamp'],
  ['flashlight', 'Flashlight'],
  ['candle', 'Candle'],
  ['mirror', 'Mirror'],
  ['plate', 'Plate'],
  ['lever', 'Lever'],
  ['door', 'Door'],
] as const;
export const TRY_TOOLS = [
  ['tryFlashlight', 'Flashlight'],
  ['tryCandle', 'Candle'],
] as const;
export type Tool = (typeof TOOLS)[number][0] | (typeof TRY_TOOLS)[number][0];
export type ViewMode = 'plain' | 'fog' | 'bright';

// A cell edge near the mouse, between `into` (the cell the mouse is in) and `from`. A door there opens into `into`.
export type Edge = { into: [number, number]; from: [number, number]; opens: Side };

export const ed = {
  cs: 40, // screen px per cell (Ctrl+wheel zooms)
  k: 40 / GRID_SIZE, // screen px per world px
  doc: blank(12, 8) as Doc,
  tries: [] as TryLight[], // lights put down to try things; never exported
  tool: 'wall' as Tool,
  pair: 1,
  view: 'fog' as ViewMode,
  showLine: true,
  showPlates: true,
  showHeld: false,
  selected: null as { x: number; y: number } | null,
  selectedDoor: null as number | null, // by trigger number
  hoverEdge: null as Edge | null,
  hover: null as { x: number; y: number } | null,
  painting: null as 'paint' | 'erase' | null,
  preview: null as Record<string, number> | null, // mirror steps from a clicked solution
  traced: null as Traced | null,
  fearLine: [] as [number, number, number, number][], // the 15% line's segments, in cells
  solutions: [] as Solution[],
  picked: -1,
  solving: false,
  stopSolving: false,
  solvedFor: '', // the level the solutions are for
  currentLevel: null as Level | null,
  mirrorDefaults: { step: 0, control: 'fixed' } as { step: number; control: Control }, // a new mirror copies the last set up
  lastAim: 0, // a new try-flashlight's aim
  lightDirty: true, // the light mask needs redrawing
};

// Set by editor.ts: rebuilds everything after an edit.
export const page = { refresh: () => {} };

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export const button = (text: string, on: boolean, onClick: () => void) => {
  const b = document.createElement('button');
  b.textContent = text;
  if (on) b.className = 'on';
  b.onclick = onClick;
  return b;
};
export const row = (...items: (string | Node)[]) => {
  const r = document.createElement('div');
  r.className = 'row';
  r.append(...items);
  return r;
};
export const canvas = $<HTMLCanvasElement>('grid');
export const ctx = canvas.getContext('2d')!;

export const levelKey = () => JSON.stringify(toSource(ed.doc));
export const inBounds = (x: number, y: number) =>
  y >= 0 && y < ed.doc.grid.length && x >= 0 && x < ed.doc.grid[0].length;
export const tryAt = (x: number, y: number) => ed.tries.findIndex(t => t.x === x && t.y === y);
