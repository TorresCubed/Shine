import { signal, computed } from '@preact/signals';
import type { Hint } from '../content/help';
import { input } from '../core/state';
import { showSplash } from './splash/state';

// UI state the game drives from outside the components (main.ts, renderer, touch input).

export type Screen = 'title' | 'levels' | 'howto' | 'credits' | 'pause' | 'ending';

// Menu screens, each opened over the last; Back pops one.
const stack = signal<Screen[]>([]);
export const currentScreen = computed(() => stack.value.at(-1) ?? null);
export const isMenuOpen = () => stack.value.length > 0;

// Set once a level is started from the menus: the in-play UI shows from then on.
export const started = signal(false);
export const markStarted = () => {
  started.value = true;
};

export const open = (screen: Screen) => {
  hideHint();
  if (screen === 'title') showSplash();
  stack.value = [...stack.value, screen];
};
export const close = () => {
  stack.value = [];
};
export const openFresh = (screen: Screen) => {
  close();
  open(screen);
};

export const goBack = () => {
  const screen = currentScreen.value;
  if (screen === 'title' || screen === 'ending') return; // nothing behind them
  stack.value = stack.value.slice(0, -1);
};

// Esc: back a screen, or pause during play.
export const onEscape = () => {
  if (isMenuOpen()) goBack();
  else if (started.value) open('pause');
};

// A hint along the bottom, for `ms`.
export const hint = signal({ text: '', touch: false, shown: false });
let hintTimer: ReturnType<typeof setTimeout> | undefined;
export const showHint = (h: Hint, ms = 12000) => {
  // Touch is certain once touched; before that, guess from the pointer.
  const touch = input.touch.value || matchMedia('(pointer: coarse)').matches;
  const text = 'both' in h ? h.both : touch ? h.touch : h.keys;
  hint.value = { text, touch, shown: true };
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, ms);
};
export const hideHint = () => {
  clearTimeout(hintTimer);
  hint.value = { ...hint.value, shown: false };
};

// The level's number, across the top as it starts.
export const levelCard = signal({ index: 0, shown: false });
let cardTimer: ReturnType<typeof setTimeout> | undefined;
export const showLevelCard = (index: number) => {
  levelCard.value = { index, shown: true };
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    levelCard.value = { ...levelCard.value, shown: false };
  }, 3500);
};

// The on-screen stick, in CSS px: where it went down, and the knob's offset from there.
export const stickView = signal<{ centre: { x: number; y: number }; knob: { x: number; y: number } } | null>(null);
