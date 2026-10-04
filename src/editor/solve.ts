import { STEP_DEGREES } from '../content/levelFormat';
import { buildLevel } from './build';
import { $, ed, levelKey, page } from './model';
import { solve, solverLimits } from './solver';
import type { Solution } from './solver';

// The solver's panel: run it, list the ways to win, preview one.

export const clearSolutions = () => {
  ed.stopSolving = true;
  ed.solutions = [];
  ed.picked = -1;
  ed.preview = null;
  $('solutions').innerHTML = '';
  $('solveStatus').textContent = '';
};

const describe = (s: Solution) => {
  const mirrors = Object.entries(s.steps)
    .map(([k, v]) => `(${k}) at ${v * STEP_DEGREES}°`)
    .join(', ');
  const aims = s.aims.length > 1 ? `${s.aims[0]}–${s.aims[s.aims.length - 1]}°` : `${s.aims[0]}°`;
  return `${mirrors ? `Mirrors ${mirrors}; ` : ''}drop at (${s.x},${s.y}) aimed ${aims}`;
};

const showSolution = (i: number) => {
  ed.picked = i;
  const s = ed.solutions[i];
  ed.preview = s.steps;
  ed.tries = [{ kind: 'flashlight', x: s.x, y: s.y, aim: s.aims[Math.floor(s.aims.length / 2)] }];
  if (ed.view === 'plain') ed.view = 'fog';
  page.refresh();
};

export const renderSolutions = () => {
  const el = $('solutions');
  el.innerHTML = '';
  ed.solutions.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}. ${describe(s)}`;
    if (i === ed.picked) b.className = 'on';
    b.onclick = () => showSolution(i);
    el.appendChild(b);
  });
};

$('solveBtn').onclick = async () => {
  if (ed.solving) {
    ed.stopSolving = true;
    return;
  }
  const { level, error } = buildLevel();
  const status = $('solveStatus');
  if (!level) {
    status.textContent = `Fix this first: ${error}`;
    return;
  }
  const limits = solverLimits(level);
  if (limits) {
    status.textContent = limits;
    return;
  }
  clearSolutions();
  ed.solvedFor = levelKey();
  ed.solving = true;
  ed.stopSolving = false;
  $('solveBtn').textContent = 'Stop';
  const found = await solve(
    level,
    (done, total) => {
      status.textContent = `${Math.round((done / total) * 100)}%`;
    },
    () => ed.stopSolving,
  );
  ed.solving = false;
  $('solveBtn').textContent = 'Find every way to win';
  if (levelKey() !== ed.solvedFor) return; // edited while solving: these are for an older level
  ed.solutions = found;
  status.textContent = ed.stopSolving
    ? `Stopped: ${ed.solutions.length} found so far.`
    : ed.solutions.length === 0
      ? 'No way to win found.'
      : ed.solutions.length === 1
        ? 'Exactly one way to win.'
        : `${ed.solutions.length} ways to win.`;
  renderSolutions();
};

$('clearPreview').onclick = () => {
  ed.preview = null;
  ed.picked = -1;
  renderSolutions();
  page.refresh();
};
