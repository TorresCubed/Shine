import { levelSources } from '../content/levels';
import type { LightKind } from '../core/types';
import { buildLevel } from './build';
import { draw } from './draw';
import { resize } from './edit';
import { blank, exportCode, fromSource, toSource } from './levelCode';
import type { Aim } from './levelCode';
import { $, ed, page, TOOLS, TRY_TOOLS } from './model';
import type { Tool, ViewMode } from './model';
import { clearSolutions } from './solve';

// The sidebar's tools, selects and buttons.

const addToolButtons = (el: HTMLElement, list: readonly (readonly [Tool, string])[]) => {
  for (const [id, name] of list) {
    const b = document.createElement('button');
    b.textContent = name;
    b.dataset.tool = id;
    b.onclick = () => {
      ed.tool = id;
      page.refresh();
    };
    el.appendChild(b);
  }
};

addToolButtons($('tools'), TOOLS);

addToolButtons($('tryTools'), TRY_TOOLS);

const pairSelect = $<HTMLSelectElement>('pairSelect');

for (let n = 1; n <= 9; n++) pairSelect.add(new Option(`${n} (door ${String.fromCharCode(96 + n)})`, String(n)));

pairSelect.onchange = () => {
  ed.pair = Number(pairSelect.value);
};

const levelSelect = $<HTMLSelectElement>('levelSelect');

levelSelect.add(new Option('New blank level', 'new'));

levelSources.forEach((_, i) => levelSelect.add(new Option(`Level ${i + 1}`, String(i))));

$('openBtn').onclick = () => {
  const v = levelSelect.value;
  ed.doc = v === 'new' ? blank(12, 8) : fromSource(levelSources[Number(v)].map, levelSources[Number(v)].options);
  ed.tries = [];
  ed.selected = null;
  clearSolutions();
  page.refresh();
};

export const held = $<HTMLSelectElement>('held');

export const stowCandle = $<HTMLInputElement>('stowCandle');

export const stowFlashlight = $<HTMLInputElement>('stowFlashlight');

export const aim = $<HTMLSelectElement>('aim');

held.onchange = () => {
  ed.doc.held = (held.value || null) as LightKind | null;
  page.refresh();
};

const setStowed = () => {
  ed.doc.stowed = [
    ...(stowCandle.checked ? ['candle' as const] : []),
    ...(stowFlashlight.checked ? ['flashlight' as const] : []),
  ];
  page.refresh();
};

stowCandle.onchange = setStowed;

stowFlashlight.onchange = setStowed;

aim.onchange = () => {
  ed.doc.aim = aim.value as Aim;
  page.refresh();
};

export const viewSelect = $<HTMLSelectElement>('viewMode');

viewSelect.onchange = () => {
  ed.view = viewSelect.value as ViewMode;
  page.refresh();
};

$<HTMLInputElement>('showLine').onchange = e => {
  ed.showLine = (e.target as HTMLInputElement).checked;
  draw();
};

$<HTMLInputElement>('showPlates').onchange = e => {
  ed.showPlates = (e.target as HTMLInputElement).checked;
  draw();
};

$<HTMLInputElement>('showHeld').onchange = e => {
  ed.showHeld = (e.target as HTMLInputElement).checked;
  page.refresh();
};

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-resize]'))
  b.onclick = () => {
    resize(b.dataset.resize!);
    page.refresh();
  };

$('copyBtn').onclick = async () => {
  try {
    await navigator.clipboard.writeText(exportCode(ed.doc));
    $('copyHint').textContent = 'Copied.';
  } catch {
    $<HTMLTextAreaElement>('code').select();
    $('copyHint').textContent = 'Selected: copy with Ctrl+C.';
  }
};

const playtest = (mode: 'fog' | 'bright') => {
  const { level, error } = buildLevel();
  if (!level) {
    alert(`Fix this first: ${error}`);
    return;
  }
  localStorage.setItem('shine-playtest', JSON.stringify(toSource(ed.doc)));
  window.open(`/?playtest&view=${mode}`, 'shine-playtest');
};

$('playFog').onclick = () => playtest('fog');

$('playBright').onclick = () => playtest('bright');
