import { GRID_SIZE, CAMERA, TRANSITION } from './core/consts';
import { initTouchControls } from './input/touch';
import { screenDark, cardShown } from './render/transition';
import { canvas, sizeScreen, setWorldSize, clampZoom, fitZoom } from './render/canvases';
import { keysDown, gameState, loadLevel, camera, stick, player } from './core/state';
import { levels } from './content/levels';
import { fromMap } from './content/levelFormat';
import type { Level } from './core/types';
import { draw } from './render/draw';
import { loadAssets } from './render/art';
import { setViewMode, nextViewMode } from './render/frame';
import { snapZoom, screenToWorld } from './render/camera';
import { act, swapHeldLight, tapAt } from './game/actions';
import { fear } from './game/movement';
import { mountUi } from './ui/App';
import { open, close, isMenuOpen, onEscape, markStarted, showHint, hideHint, showLevelCard } from './ui/store';
import { LEVEL_HINTS } from './content/help';
import { markCompleted, markPlayed, lastPlayed } from './game/progress';
import { playSplash, skipSplash, splashPlaying, hideSplash } from './ui/splash/state';

const resize = () => {
  sizeScreen();
  // Still fitted (not zoomed since): refit, e.g. when a phone turns.
  if (camera.fitted && levelIndex >= 0) {
    camera.zoom = fitZoom();
    snapZoom();
  }
};

// Playtest (?playtest&view=fog|bright, from the editor): just the editor's level, in a view showing all of it.
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

// Arriving at a level: it fades in from black, zoomed to fit if new. Until a level is picked from the
// menus, the one behind the title isn't `playing`: not saved as played, no card or hint.
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

// Leaving a level: fade to black, then start the next.
const leaveTo = (index: number, fadeOutMs: number, fadeInMs?: number, fresh?: boolean) => {
  if (leaving) return;
  leaving = true;
  cardShown.go(0, fadeOutMs);
  screenDark.go(1, fadeOutMs, () => startLevel(index, fadeInMs, fresh));
};

// A new level opens fitted, then glides in to about CAMERA.start.viewCells cells across (unless it
// already fits closer, you've zoomed, or it's the playtest).
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

// On from the Level Complete card (the last level goes to the ending instead: see watchPlay).
const nextLevel = () => {
  if (gameState.status.value !== 'won' || leaving || isMenuOpen()) return;
  leaveTo((levelIndex + 1) % playLevels.length, TRANSITION.levelFadeOutMs);
};
const restart = () => {
  if (playing || playtest) leaveTo(levelIndex, TRANSITION.restartFadeMs, TRANSITION.restartFadeMs * 2);
};

// From the menus: always a fresh start (card, hint, zoom-in), even of the level behind.
const play = (index: number) => {
  close();
  hideSplash();
  hideHint();
  playing = true;
  markStarted();
  // No fade out: from under the menu, it would only reveal the level first.
  startLevel(index, TRANSITION.levelFadeInMs, true);
};

// Saves a level as finished at the exit, and when you're stranded in the dark for a while, hints at
// restarting (once per try).
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
    // The last level has no card: straight to the ending.
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
  // One-shot actions ignore auto-repeat.
  if (e.repeat) return;
  if (key === 'f') swapHeldLight();
  if (key === ' ') act();
  if (key === 'enter') nextLevel();
  if (key === 'v' && playtest) nextViewMode();
  if (key === 'r') restart();
});
window.addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));
// On the Level Complete card a tap continues; otherwise it acts on what's under it.
initTouchControls(canvas, (x, y) =>
  isMenuOpen() ? undefined : gameState.status.value === 'won' ? nextLevel() : tapAt(screenToWorld(x, y)),
);
// One zoom step per wheel click; a trackpad's small deltas add up to one.
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
// ?level=N (from 1) or the playtest starts straight in a level; otherwise the title, over the last played.
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
