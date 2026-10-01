import candleUrl from "./assets/largeCandle.png";

// The candle behind the title screen. Loading in, it opens on the whole candle standing on the
// bottom of the screen as it lights: a warm glow swells out from the flame (and the candle comes up
// out of the dark with it), holds, then the candle sinks till just its top shows, still glowing,
// and the title comes in above it. A click or key skips to the end. It sits over the game
// (which goes on drawing behind, unseen) and under the menus; it fades out when a level starts, and
// back in (already settled) on returning to the title.

// largeCandle.png: 135 x 240, its flame rows 2-59. The glow centres on the top third of the flame.
const CANDLE_W = 135, CANDLE_H = 240;
const GLOW_AT = { x: 65.5, y: 21 };
const BODY_CENTRE_X = 69.5; // the candle's body (columns 30-108), centred on the screen
// How much of the candle shows above the bottom of the screen, as the row of its art there: all of
// it as it lights (its foot on the bottom edge), then just the top as it settles (all of it would
// run up behind the menu).
const OPENING_ROW = CANDLE_H;
const SETTLED_ROW = 120;
const LIGHT_MS = 1100;  // the glow swelling up as it lights
const HOLD_MS = 900;    // then held at the centre
const SINK_MS = 1800;   // then sinking to the bottom
const TITLE_AT = 0.55;  // of the way down when the title starts coming in

const root = document.createElement('div');
root.className = 'splash';
const rig = document.createElement('div'); // the candle and its glow, moved as one
rig.className = 'splash-rig';
const glow = document.createElement('div');
glow.className = 'splash-glow';
const candle = document.createElement('img');
candle.className = 'splash-candle';
candle.src = candleUrl;
candle.alt = '';
rig.append(glow, candle);
root.append(rig);

let startedAt = 0;
let skipped = false;
let shown = false;
let onTitle: (() => void) | null = null; // the title's due: called once, as the candle sinks
let frame = 0;

const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Whole-number scale (so the pixel art stays crisp): about half the screen's height, at least 1x.
const scale = () => Math.max(1, Math.floor(innerHeight * 0.55 / CANDLE_H));

const tick = (now: number) => {
  frame = shown ? requestAnimationFrame(tick) : 0;
  const k = scale();
  const t = skipped ? Infinity : now - startedAt;
  const lit = Math.min(1, t / LIGHT_MS);
  const sink = easeInOut(Math.min(1, Math.max(0, (t - LIGHT_MS - HOLD_MS) / SINK_MS)));
  if (onTitle && (skipped || sink >= TITLE_AT)) { const call = onTitle; onTitle = null; call(); }

  // Where the candle's top-left goes: centred across, from its foot on the bottom edge down to
  // showing only down to SETTLED_ROW.
  const left = innerWidth / 2 - BODY_CENTRE_X * k;
  const fromTop = innerHeight - OPENING_ROW * k, toTop = innerHeight - SETTLED_ROW * k;
  rig.style.transform = `translate(${Math.round(left)}px, ${Math.round(fromTop + (toTop - fromTop) * sink)}px)`;
  candle.style.width = `${CANDLE_W * k}px`;
  candle.style.height = `${CANDLE_H * k}px`;

  // The glow: centred on the flame, swelling as it lights, then flickering (a few out-of-step waves,
  // like the flames in the game: drawing only).
  const size = Math.hypot(innerWidth, innerHeight) * 1.3;
  const flicker = 0.9 + 0.05 * Math.sin(now / 130) + 0.03 * Math.sin(now / 57 + 1.3) + 0.02 * Math.sin(now / 23 + 4.1);
  const swell = easeInOut(lit);
  glow.style.width = glow.style.height = `${size}px`;
  glow.style.left = `${GLOW_AT.x * k - size / 2}px`;
  glow.style.top = `${GLOW_AT.y * k - size / 2}px`;
  glow.style.opacity = String(swell * flicker);
  glow.style.transform = `scale(${(0.35 + 0.65 * swell) * (0.98 + 0.03 * flicker)})`;
  candle.style.filter = `brightness(${0.25 + 0.75 * swell})`;
}

// Plays the opening, calling `title` when the title should come in.
export const playSplash = (title: () => void) => {
  onTitle = title;
  skipped = reducedMotion();
  startedAt = performance.now();
  showSplash(false);
}
// Jumps to the end of the opening (a click or key). Returns whether there was anything to skip.
export const skipSplash = () => {
  if (!shown || skipped) return false;
  skipped = true;
  return true;
}
export const splashPlaying = () => shown && !skipped && performance.now() - startedAt < LIGHT_MS + HOLD_MS + SINK_MS;

// Shows it, fading in: settled, unless it's playSplash opening it (or the opening's still going, as
// it is when the title comes in partway down).
export const showSplash = (settled = true) => {
  if (settled && !(shown && !skipped)) skipped = true;
  if (!root.isConnected) document.body.append(root);
  shown = true;
  root.classList.add('shown');
  if (!frame) frame = requestAnimationFrame(tick);
}
export const hideSplash = () => {
  shown = false;
  root.classList.remove('shown');
}

root.addEventListener('pointerdown', (e) => { e.stopPropagation(); skipSplash(); });
