import { signal } from "@preact/signals";

// The title's candle: it lights, holds, then sinks to show just its top, and the title comes in.
// A click or key skips to the end. Shown again, settled, on returning to the title.

const LIGHT_MS = 750; // glow swelling up
const HOLD_MS = 300; // lit, before it sinks
const SINK_MS = 1800;
const TITLE_AT = 0.55; // of the sink, when the title comes in

export const splashShown = signal(false);
let startedAt = 0;
let skipped = false;
let onTitle: (() => void) | null = null;

const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// Where the opening is at `now`: how lit (0-1) and how far sunk (0-1), both eased.
export const splashProgress = (now: number) => {
  const t = skipped ? Infinity : now - startedAt;
  const lit = easeInOut(clamp01(t / LIGHT_MS));
  const sink = easeInOut(clamp01((t - LIGHT_MS - HOLD_MS) / SINK_MS));
  if (onTitle && (skipped || sink >= TITLE_AT)) { const call = onTitle; onTitle = null; call(); }
  return { lit, sink };
};

// Plays the opening, calling `title` when the title should come in.
export const playSplash = (title: () => void) => {
  onTitle = title;
  skipped = matchMedia('(prefers-reduced-motion: reduce)').matches;
  startedAt = performance.now();
  showSplash(false);
};

// Jumps to the end. Returns whether there was anything to skip.
export const skipSplash = () => {
  if (!splashShown.value || skipped) return false;
  skipped = true;
  return true;
};

export const splashPlaying = () =>
  splashShown.value && !skipped && performance.now() - startedAt < LIGHT_MS + HOLD_MS + SINK_MS;

// Fades in, settled unless the opening is (still) playing.
export const showSplash = (settled = true) => {
  if (settled && !(splashShown.value && !skipped)) skipped = true;
  splashShown.value = true;
};

export const hideSplash = () => { splashShown.value = false; };
