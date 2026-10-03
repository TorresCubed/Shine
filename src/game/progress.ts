// Progress, kept in localStorage: the levels played and finished (by number, from 1), and the last
// one played. Storage can be missing or refuse (private browsing, blocked site data), so every read
// and write is guarded and the game plays on without it.

const KEY = 'shine-progress';
type Progress = { completed: number[]; played: number[]; last: number | null };

const numbers = (list: unknown) => (Array.isArray(list) ? (list.filter(Number.isInteger) as number[]) : []);
const read = (): Progress => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && Array.isArray(p.completed)) {
      const completed = numbers(p.completed);
      const last = Number.isInteger(p.last) ? p.last : null;
      // (Saved before `played` was kept: what's finished, and the last level, were played.)
      const played = p.played ? numbers(p.played) : [...completed, ...(last !== null ? [last] : [])];
      return { completed, played, last };
    }
  } catch {
    /* no storage, or nothing usable in it */
  }
  return { completed: [], played: [], last: null };
};
const write = (p: Progress) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* no storage: progress just isn't kept */
  }
};

let progress = read();

export const isCompleted = (levelNumber: number) => progress.completed.includes(levelNumber);
export const isPlayed = (levelNumber: number) => progress.played.includes(levelNumber) || isCompleted(levelNumber);
export const completedCount = () => progress.completed.length;
export const lastPlayed = () => progress.last;

export const markCompleted = (levelNumber: number) => {
  if (isCompleted(levelNumber)) return;
  progress = { ...progress, completed: [...progress.completed, levelNumber].sort((a, b) => a - b) };
  write(progress);
};
export const markPlayed = (levelNumber: number) => {
  if (progress.last === levelNumber && isPlayed(levelNumber)) return;
  const played = isPlayed(levelNumber) ? progress.played : [...progress.played, levelNumber].sort((a, b) => a - b);
  progress = { ...progress, played, last: levelNumber };
  write(progress);
};
export const resetProgress = () => {
  progress = { completed: [], played: [], last: null };
  write(progress);
};
