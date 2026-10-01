// Progress, kept in localStorage: the levels finished (by number, from 1) and the last one played.
// Storage can be missing or refuse (private browsing, blocked site data), so every read and write
// is guarded and the game plays on without it.

const KEY = 'shine-progress';
type Progress = { completed: number[]; last: number | null };

const read = (): Progress => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && Array.isArray(p.completed)) return { completed: p.completed.filter(Number.isInteger), last: Number.isInteger(p.last) ? p.last : null };
  } catch { /* no storage, or nothing usable in it */ }
  return { completed: [], last: null };
}
const write = (p: Progress) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* no storage: progress just isn't kept */ }
}

let progress = read();

export const isCompleted = (levelNumber: number) => progress.completed.includes(levelNumber);
export const completedCount = () => progress.completed.length;
export const lastPlayed = () => progress.last;

export const markCompleted = (levelNumber: number) => {
  if (isCompleted(levelNumber)) return;
  progress = { ...progress, completed: [...progress.completed, levelNumber].sort((a, b) => a - b) };
  write(progress);
}
export const markPlayed = (levelNumber: number) => {
  if (progress.last === levelNumber) return;
  progress = { ...progress, last: levelNumber };
  write(progress);
}
export const resetProgress = () => {
  progress = { completed: [], last: null };
  write(progress);
}
