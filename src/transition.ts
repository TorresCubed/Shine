import { easeInOut } from "./util";

// A value that eases from where it is to a target over some time, then optionally runs something:
// the screen's darkness and the Level Complete card's opacity, for level transitions.
export class Fade {
  private from = 0;
  private to = 0;
  private startsAt = 0;
  private ms = 1;
  private then: (() => void) | null = null;
  private value: number;
  constructor(value = 0) { this.value = value; }

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
export const cardShown = new Fade(0);  // the Level Complete card: 0 hidden, 1 shown
