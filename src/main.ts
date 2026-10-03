import { GRID_SIZE, CAMERA, TRANSITION } from './core/consts';
import { initTouchControls } from './input/touch';
import { screenDark, cardShown } from './render/transition';
import { canvas, sizeScreen, setWorldSize, clampZoom, fitZoom } from './render/canvases';
import { keysDown, gameState, loadLevel, camera, stick, player } from './core/state';
import { levels, fromMap } from './content/levels';
import type { Level } from './core/types';
import { draw } from './render/draw';
import { loadAssets } from './render/art';
import { setViewMode, nextViewMode } from './render/frame';
import { snapZoom, screenToWorld } from './render/camera';
import { act, swapHeldLight, tapAt, fear } from './game/player';
import { mountUi } from './ui/App';
import { open, close, isMenuOpen, onEscape, markStarted, showHint, hideHint, showLevelCard } from './ui/store';
import { LEVEL_HINTS } from './content/help';
import { markCompleted, markPlayed, lastPlayed } from './game/progress';
import { playSplash, skipSplash, splashPlaying, hideSplash } from './ui/splash/state';

const resize = () => {
  sizeScreen();
  // Still showing the whole level (not zoomed since): keep it fitted, e.g. when a phone turns.
  if (camera.fitted && levelIndex >= 0) {
    camera.zoom = fitZoom();
    snapZoom();
  }
};

// Playtest (opened from the level editor as ?playtest&view=fog|bright): just the level the editor
// saved, with a view mode that shows the whole level. V switches view.
const params = new URLSearchParams(location.search);
const playtest = params.has('playtest');
const playtestLevel = (): Level => {
  try {
    const { map, options } = JSON.parse(localStorage.getItem('shine-playtest') ?? '');
    return fromMap('Playtest', map, options);
  } catch (e) {
    alert(`Couldn't load the level to playtest: ${(e as Error).message}`);
    return levels[0];
  }
};
const playLevels = playtest ? [playtestLevel()] : levels;
if (playtest) setViewMode(params.get('view') === 'bright' ? 'bright' : 'fog');

// Arriving at a level: it fades in from black as its lights warm up, zoomed to fit if it's new (not a
// restart). Behind the title screen a level just sits there; once one is picked from the menus,
// `playing` turns on: levels are saved as played and get their card and hint.
let levelIndex = -1;
let leaving = false; // fading out to another level (or a restart): ignore Enter and R till it's done
let playing = false;
const startLevel = (index: number, fadeInMs = TRANSITION.levelFadeInMs, fresh = index !== levelIndex) => {
  levelIndex = index;
  loadLevel(playLevels[index]);
  setWorldSize(playLevels[index].width * GRID_SIZE, playLevels[index].height * GRID_SIZE);
  if (fresh) {
    camera.zoom = fitZoom();
    camera.fitted = true;
    snapZoom();
    scheduleIntroZoom();
  }
  camera.panX = camera.panY = 0;
  leaving = false;
  cardShown.set(0);
  screenDark.set(1);
  screenDark.go(0, fadeInMs);
  strandHinted = false;
  if (!playing || playtest) return;
  markPlayed(index + 1);
  if (!fresh) return; // a restart: you've seen the card and the hint
  showLevelCard(index);
  const hint = LEVEL_HINTS[index + 1];
  if (hint)
    setTimeout(() => {
      if (levelIndex === index && !isMenuOpen()) showHint(hint);
    }, fadeInMs);
  else hideHint();
};

// Leaving a level: fade to black (and the Level Complete card out), then start the next one.
const leaveTo = (index: number, fadeOutMs: number, fadeInMs?: number, fresh?: boolean) => {
  if (leaving) return;
  leaving = true;
  cardShown.go(0, fadeOutMs);
  screenDark.go(1, fadeOutMs, () => startLevel(index, fadeInMs, fresh));
};

// A new level opens fitted; after CAMERA.start.overviewMs the camera glides in to about
// CAMERA.start.viewCells cells across the screen's shorter side. Not if it already fits closer, if
// you've zoomed yourself, or in the playtest (whose views show the whole level).
let introTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleIntroZoom = () => {
  clearTimeout(introTimer);
  camera.intro = !playtest;
  if (!camera.intro) return;
  introTimer = setTimeout(() => {
    if (!camera.intro) return;
    camera.intro = false;
    const raw = Math.min(canvas.width, canvas.height) / (CAMERA.start.viewCells * GRID_SIZE);
    const z = clampZoom(raw >= 1 ? Math.round(raw) : raw);
    if (z <= camera.zoom) return;
    camera.zoom = z;
    camera.glideMs = CAMERA.start.zoomMs;
    camera.fitted = false;
  }, CAMERA.start.overviewMs);
};

const ZOOM_OUT_STEP = 1.25; // per step below 1x
const zoomStep = (dir: 1 | -1) => {
  camera.fitted = false;
  camera.intro = false;
  const z = camera.zoom;
  camera.zoom = clampZoom(
    dir > 0 ? (z < 1 ? Math.min(1, z * ZOOM_OUT_STEP) : z + 1) : z > 1 ? z - 1 : z / ZOOM_OUT_STEP,
  );
};

// On from the Level Complete card to the next level. (The last level goes to the ending instead: see
// watchPlay.)
const nextLevel = () => {
  if (gameState.status.value !== 'won' || leaving || isMenuOpen()) return;
  leaveTo((levelIndex + 1) % playLevels.length, TRANSITION.levelFadeOutMs);
};
const restart = () => {
  if (playing || playtest) leaveTo(levelIndex, TRANSITION.restartFadeMs, TRANSITION.restartFadeMs * 2);
};

// A level picked from the menus: always starts afresh (card, hint, the zoom-in), even the one behind.
const play = (index: number) => {
  close();
  hideSplash();
  hideHint();
  playing = true;
  markStarted();
  leaving = false;
  leaveTo(index, TRANSITION.levelFadeOutMs, TRANSITION.levelFadeInMs, true);
};

// Finishing a level saves it, as soon as you reach the exit. And walking into the dark for a while
// (stopped by the fear rule, going nowhere) gets a hint on how to restart, once per try.
let wasWon = false;
let strandedMs = 0;
let strandHinted = false;
let lastWatch = 0;
let lastSpot = { x: 0, y: 0 };
const STRANDED_HINT_MS = 2000;
const watchPlay = (now: number) => {
  const won = gameState.status.value === 'won';
  if (won && !wasWon && playing && !playtest) {
    markCompleted(levelIndex + 1);
    // The last level has no Level Complete card: it's straight on to the ending.
    if (levelIndex === playLevels.length - 1) {
      hideHint();
      open('ending');
    }
  }
  wasWon = won;
  const stuck =
    playing &&
    !won &&
    !isMenuOpen() &&
    now - fear.stoppedAt < 150 &&
    Math.hypot(player.x - lastSpot.x, player.y - lastSpot.y) < 0.5;
  strandedMs = stuck ? strandedMs + Math.min(100, now - lastWatch) : 0;
  if (strandedMs >= STRANDED_HINT_MS && !strandHinted) {
    strandHinted = true;
    showHint(
      {
        keys: 'Stuck in the dark? Press R to restart the level.',
        touch: 'Stuck in the dark? Tap ↻ to restart the level.',
      },
      6000,
    );
  }
  lastWatch = now;
  lastSpot = { x: player.x, y: player.y };
  requestAnimationFrame(watchPlay);
};

// Opening a menu lets go of everything held, so you don't walk on behind it.
const letGo = () => {
  keysDown.clear();
  stick.x = stick.y = 0;
};

window.addEventListener('resize', resize);
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (splashPlaying()) {
    skipSplash();
    return;
  } // any key skips the opening
  if (key === 'escape' && !playtest) {
    letGo();
    onEscape();
    return;
  }
  if (isMenuOpen()) return; // the menus take keys for their buttons (Tab, Enter, Space)
  keysDown.add(key);
  if (key === ' ') e.preventDefault(); // Space would otherwise scroll the page
  if (key === '=' || key === '+') zoomStep(1);
  if (key === '-') zoomStep(-1);
  // One-shot actions ignore the keyboard's auto-repeat, so holding a key is one press.
  if (e.repeat) return;
  if (key === 'f') swapHeldLight();
  if (key === ' ') act();
  if (key === 'enter') nextLevel();
  if (key === 'v' && playtest) nextViewMode();
  if (key === 'r') restart();
});
window.addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));
// Taps, clicks and the on-screen stick. On the Level Complete card a tap goes on to the next level;
// otherwise it's tapAt, on whatever's under it.
initTouchControls(canvas, (x, y) =>
  isMenuOpen() ? undefined : gameState.status.value === 'won' ? nextLevel() : tapAt(screenToWorld(x, y)),
);
// A wheel click is one step. Trackpads send a stream of small deltas, so those add up to a step.
let wheelTotal = 0;
window.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    wheelTotal += e.deltaY;
    if (Math.abs(wheelTotal) < 50) return;
    zoomStep(wheelTotal < 0 ? 1 : -1);
    wheelTotal = 0;
  },
  { passive: false },
);

mountUi({ play, restart, swapLights: swapHeldLight, levelCount: playLevels.length });

resize();
// ?level=N goes straight into level N (numbered from 1), as does the editor's playtest. Otherwise the
// title screen, over the last level played (or the first).
const levelParam = Number(params.get('level'));
const asked = Number.isInteger(levelParam) && levelParam >= 1 && levelParam <= levels.length ? levelParam - 1 : null;
if (playtest || asked !== null) {
  playing = true;
  markStarted();
  startLevel(playtest ? 0 : asked!);
} else {
  const last = lastPlayed();
  startLevel(last !== null && last >= 1 && last <= levels.length ? last - 1 : 0);
  playSplash(() => open('title')); // the candle lighting, then the title over it
}
requestAnimationFrame(watchPlay);

loadAssets().then(() => requestAnimationFrame(draw));
