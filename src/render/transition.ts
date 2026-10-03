import { easeInOut } from '../core/util';
import { TRANSITION } from '../core/consts';
import { gameState, input } from '../core/state';
import { isMenuOpen } from '../ui/store';
import { canvas, ctx, pixelRatio } from './canvases';

// A value that eases from where it is to a target over some time, then optionally runs something:
// the screen's darkness and the Level Complete card's opacity, for level transitions.
export class Fade {
  private from = 0;
  private to = 0;
  private startsAt = 0;
  private ms = 1;
  private then: (() => void) | null = null;
  private value: number;
  constructor(value = 0) {
    this.value = value;
  }

  // Ease to `to` over `ms`, starting `delay` ms from now, then call `then`.
  go(to: number, ms: number, then: (() => void) | null = null, delay = 0) {
    this.from = this.value;
    this.to = to;
    this.startsAt = performance.now() + delay;
    this.ms = Math.max(1, ms);
    this.then = then;
  }

  // Jump straight to `value`.
  set(value: number) {
    this.value = this.from = this.to = value;
    this.then = null;
  }

  // Its value at `now` (on the performance.now() clock), running `then` once it gets there.
  valueAt(now: number) {
    const t = Math.min(1, Math.max(0, (now - this.startsAt) / this.ms));
    this.value = this.from + (this.to - this.from) * easeInOut(t);
    if (t >= 1 && this.then) {
      const then = this.then;
      this.then = null;
      then();
    }
    return this.value;
  }
}

export const screenDark = new Fade(1); // 0 clear, 1 black
export const cardShown = new Fade(0); // the Level Complete card: 0 hidden, 1 shown

// The Level Complete card, at `alpha`: the title, then room for a flame (to come: a candle flickering
// beneath the title), then the prompt.
const CARD_FLAME_SPACE = 110; // px (CSS) kept clear between the title and the prompt
const drawLevelComplete = (alpha: number) => {
  const w = canvas.width / pixelRatio;
  const h = canvas.height / pixelRatio;
  const titleY = h / 2 - CARD_FLAME_SPACE / 2 - 12;
  const promptY = h / 2 + CARD_FLAME_SPACE / 2 + 24;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('Level Complete', w / 2, titleY);
  ctx.fillStyle = '#ccc';
  ctx.font = '16px sans-serif';
  ctx.fillText(input.touch.value ? 'Tap to continue' : 'Press Enter to continue', w / 2, promptY);
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
};

// Level transitions: once you reach the exit, the world dims and the card fades in (see main.ts for
// leaving and arriving). Then the screen's darkness and the card go over everything.
let winShown = false;
export const drawTransition = (now: number) => {
  if (gameState.status.value === 'won' && !winShown) {
    winShown = true;
    screenDark.go(TRANSITION.winDim, TRANSITION.winFadeMs);
    cardShown.go(1, TRANSITION.cardFadeMs, null, TRANSITION.winFadeMs / 2);
  }
  if (gameState.status.value !== 'won') winShown = false;
  const w = canvas.width / pixelRatio;
  const h = canvas.height / pixelRatio;
  const dark = screenDark.valueAt(now);
  const card = cardShown.valueAt(now);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${dark.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (card > 0 && !isMenuOpen()) drawLevelComplete(card); // (not through a menu: it shows through)
};
