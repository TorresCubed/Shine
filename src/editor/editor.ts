import { buildLevel, lightsToTrace, traceFearLine } from './build';
import { aim, held, stowCandle, stowFlashlight, viewSelect } from './controls';
import { draw } from './draw';
import { exportCode } from './levelCode';
import { $, ed, levelKey, page } from './model';
import './mouse';
import { traceLevel } from './preview';
import { renderProps } from './props';
import { clearSolutions, renderSolutions } from './solve';

// The level editor: paint a map, set up its doors, mirrors and lights, see its light with the real ray
// tracer, find every way to win, playtest it, and export the code for levels.ts.

const STORE_KEY = 'shine-editor';

const save = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ doc: ed.doc, tries: ed.tries }));
  } catch {
    /* no storage */
  }
};

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved?.doc) {
      ed.doc = saved.doc;
      ed.tries = saved.tries ?? [];
    }
  } catch {
    /* start blank */
  }
};

// After any edit: rebuild the level, retrace its light, and update every panel.
const refresh = () => {
  if ((ed.solutions.length || ed.solving) && levelKey() !== ed.solvedFor) {
    clearSolutions();
    $('solveStatus').textContent = 'The level changed: solve again.';
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-tool]'))
    b.classList.toggle('on', b.dataset.tool === ed.tool);
  $('pairRow').style.display = ed.tool === 'plate' || ed.tool === 'lever' || ed.tool === 'door' ? '' : 'none';
  held.value = ed.doc.held ?? '';
  stowCandle.checked = ed.doc.stowed.includes('candle');
  stowFlashlight.checked = ed.doc.stowed.includes('flashlight');
  aim.value = ed.doc.aim;
  viewSelect.value = ed.view;

  // Built exactly as the game builds it, so mistakes show here.
  const { level, error } = buildLevel();
  const status = $('status');
  status.className = level ? 'ok' : 'bad';
  status.textContent = level ? 'Valid level.' : error;
  ed.currentLevel = level;
  ed.traced = level && ed.view !== 'plain' ? traceLevel(level, lightsToTrace(level), ed.preview ?? {}) : null;
  ed.fearLine = ed.traced ? traceFearLine(ed.traced) : [];
  ed.lightDirty = true;

  renderProps();
  renderSolutions();
  draw();
  $<HTMLTextAreaElement>('code').value = exportCode(ed.doc);
  save();
};

page.refresh = refresh;
load();
refresh();
