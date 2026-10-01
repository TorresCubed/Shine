import { FOG_MEMORY_SCALE, GRID_SIZE, CAMERA_MAX_ZOOM, LEVEL_FADE_IN_MS, LEVEL_FADE_OUT_MS, RESTART_FADE_MS, START_VIEW_CELLS, START_OVERVIEW_MS, START_ZOOM_MS } from "./consts";
import { initTouchControls } from "./touchControls";
import { screenDark, cardShown } from "./transition";
import { keysDown, gameState, loadLevel, camera, stick, player } from "./state";
import { levels, fromMap } from "./levels";
import type { Level } from "./interfaces";
import { draw, loadAssets, setViewMode, nextViewMode, snapZoom, screenToWorld } from "./renderer";
import { act, swapHeldLight, tapAt, fear } from "./playerLogic";
import { initMenu, open, close, isMenuOpen, onEscape, markStarted, showHint, hideHint, showLevelCard } from "./menu";
import { LEVEL_HINTS } from "./levelInfo";
import { markCompleted, markPlayed, lastPlayed } from "./progress";
import { playSplash, skipSplash, splashPlaying, hideSplash } from "./splash";

// The screen: only ever shows the camera's view of worldCanvas, plus on-screen text.
export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

// The whole level, drawn at 1px per world pixel. Everything below is sized to the level too, so
// levels can be bigger than the window.
export const worldCanvas = document.createElement('canvas');
export const worldCtx = worldCanvas.getContext('2d')!;

// Fog memory: a low-res grayscale mask, each pixel the brightest that spot has ever been seen lit.
export const exploredCanvas = document.createElement('canvas');
export const exploredCtx = exploredCanvas.getContext('2d')!;
// The same, but fading while out of sight (see MEMORY_FADE_S): how recently each spot was seen. Kept
// inverted (black = just seen, white = forgotten), so fading is exact (see renderer fadeMemory).
export const recentCanvas = document.createElement('canvas');
export const recentCtx = recentCanvas.getContext('2d')!;

// All of this frame's light regions, added together, before going onto the world canvas.
export const litLayer = document.createElement('canvas');
export const litCtx = litLayer.getContext('2d')!;

// Scratch canvas each single light region is built on.
export const regionLayer = document.createElement('canvas');
export const regionCtx = regionLayer.getContext('2d')!;

// The canvas has one pixel per physical screen pixel (so the browser never rescales it, e.g. with
// Windows display scaling), and is shown at the window's size.
export let pixelRatio = 1;
const resize = () => {
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  // Still showing the whole level (not zoomed since): keep it fitted, e.g. when a phone turns.
  if (camera.fitted && levelIndex >= 0) { camera.zoom = fitZoom(); snapZoom(); }
}

// Sizes every world layer to the level, which also wipes the fog memory.
const setWorldSize = (width: number, height: number) => {
  for (const c of [worldCanvas, regionLayer, litLayer]) { c.width = width; c.height = height; }
  for (const [c, x] of [[exploredCanvas, exploredCtx], [recentCanvas, recentCtx]] as const) {
    c.width = Math.ceil(width * FOG_MEMORY_SCALE);
    c.height = Math.ceil(height * FOG_MEMORY_SCALE);
    x.fillStyle = c === recentCanvas ? 'white' : 'black'; // nothing remembered (the recent memory is inverted)
    x.fillRect(0, 0, c.width, c.height);
  }
}

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
}
const playLevels = playtest ? [playtestLevel()] : levels;
if (playtest) setViewMode(params.get('view') === 'bright' ? 'bright' : 'fog');

// Arriving at a level: it fades in from black (over `fadeInMs`) as its lights warm up. A new level
// (not a restart) is zoomed to fit.
// Behind the title screen a level plays itself out (nobody's at the controls); once you pick one
// from the menus, `playing` turns on: levels are saved as played, and get their card and hint.
let levelIndex = -1;
let leaving = false; // fading out to another level (or a restart): ignore Enter and R till it's done
let playing = false;
const startLevel = (index: number, fadeInMs = LEVEL_FADE_IN_MS, fresh = index !== levelIndex) => {
  levelIndex = index;
  loadLevel(playLevels[index]);
  setWorldSize(playLevels[index].width * GRID_SIZE, playLevels[index].height * GRID_SIZE);
  if (fresh) { camera.zoom = fitZoom(); camera.fitted = true; snapZoom(); scheduleIntroZoom(); }
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
  if (hint) setTimeout(() => { if (levelIndex === index && !isMenuOpen()) showHint(hint); }, fadeInMs);
  else hideHint();
}

// Leaving a level: fade to black (and the Level Complete card out), then start the next one.
const leaveTo = (index: number, fadeOutMs: number, fadeInMs?: number, fresh?: boolean) => {
  if (leaving) return;
  leaving = true;
  cardShown.go(0, fadeOutMs);
  screenDark.go(1, fadeOutMs, () => startLevel(index, fadeInMs, fresh));
}

// Zoom is screen px per world px. From 1 up it's whole numbers only, so every art pixel is an exact
// square of screen pixels, except exactly fitting the level (which fills the screen) and mid-pinch
// (`free`). Below 1 (only to fit a level bigger than the screen) it's continuous, down to where the
// whole level fits. The most is CAMERA_MAX_ZOOM art px per CSS px, so a phone's dense screen can
// zoom in as far, to the eye, as a desktop one.
const exactFit = () => Math.min(canvas.width / worldCanvas.width, canvas.height / worldCanvas.height);
export const clampZoom = (zoom: number, free = false) => {
  const fit = exactFit();
  const max = Math.max(CAMERA_MAX_ZOOM, Math.floor(CAMERA_MAX_ZOOM * pixelRatio));
  const z = Math.min(max, Math.max(Math.min(fit, 1), zoom));
  if (free || z < 1 || Math.abs(z - fit) < 1e-6) return z;
  return Math.floor(z);
}
// The closest zoom that shows the whole level.
export const fitZoom = () => clampZoom(exactFit());

// A new level opens fitted, as an overview; after START_OVERVIEW_MS the camera glides in to show
// about START_VIEW_CELLS cells across the screen's shorter side (the nearest whole zoom, so the art
// stays crisp). Not if the level already fits closer than that, if you've zoomed yourself in the
// meantime, or in the editor's playtest (whose views are there to show the whole level).
let introTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleIntroZoom = () => {
  clearTimeout(introTimer);
  camera.intro = !playtest;
  if (!camera.intro) return;
  introTimer = setTimeout(() => {
    if (!camera.intro) return;
    camera.intro = false;
    const raw = Math.min(canvas.width, canvas.height) / (START_VIEW_CELLS * GRID_SIZE);
    const z = clampZoom(raw >= 1 ? Math.round(raw) : raw);
    if (z <= camera.zoom) return;
    camera.zoom = z;
    camera.glideMs = START_ZOOM_MS;
    camera.fitted = false;
  }, START_OVERVIEW_MS);
}

const ZOOM_OUT_STEP = 1.25; // per step below 1x
const zoomStep = (dir: 1 | -1) => {
  camera.fitted = false;
  camera.intro = false;
  const z = camera.zoom;
  camera.zoom = clampZoom(dir > 0 ? (z < 1 ? Math.min(1, z * ZOOM_OUT_STEP) : z + 1) : (z > 1 ? z - 1 : z / ZOOM_OUT_STEP));
}

// On from the Level Complete card to the next level. (The last level goes to the ending instead: see
// watchPlay.)
const nextLevel = () => {
  if (gameState.status !== 'won' || leaving || isMenuOpen()) return;
  leaveTo((levelIndex + 1) % playLevels.length, LEVEL_FADE_OUT_MS);
};
const restart = () => { if (playing || playtest) leaveTo(levelIndex, RESTART_FADE_MS, RESTART_FADE_MS * 2); };

// A level picked from the menus: always starts afresh (card, hint, the zoom-in), even the one behind.
const play = (index: number) => {
  close();
  hideSplash();
  hideHint();
  playing = true;
  markStarted();
  leaving = false;
  leaveTo(index, LEVEL_FADE_OUT_MS, LEVEL_FADE_IN_MS, true);
}

// Finishing a level saves it, as soon as you reach the exit. And walking into the dark for a while
// (stopped by the fear rule, going nowhere) gets a hint on how to restart, once per try.
let wasWon = false, strandedMs = 0, strandHinted = false, lastWatch = 0, lastSpot = { x: 0, y: 0 };
const STRANDED_HINT_MS = 2000;
const watchPlay = (now: number) => {
  const won = gameState.status === 'won';
  if (won && !wasWon && playing && !playtest) {
    markCompleted(levelIndex + 1);
    // The last level has no Level Complete card: it's straight on to the ending.
    if (levelIndex === playLevels.length - 1) { hideHint(); open('ending'); }
  }
  wasWon = won;
  const stuck = playing && !won && !isMenuOpen() && now - fear.stoppedAt < 150
    && Math.hypot(player.x - lastSpot.x, player.y - lastSpot.y) < 0.5;
  strandedMs = stuck ? strandedMs + Math.min(100, now - lastWatch) : 0;
  if (strandedMs >= STRANDED_HINT_MS && !strandHinted) {
    strandHinted = true;
    showHint({ keys: 'Stuck in the dark? Press R to restart the level.', touch: 'Stuck in the dark? Tap ↻ to restart the level.' }, 6000);
  }
  lastWatch = now;
  lastSpot = { x: player.x, y: player.y };
  requestAnimationFrame(watchPlay);
}

// Opening a menu lets go of everything held, so you don't walk on behind it.
const letGo = () => { keysDown.clear(); stick.x = stick.y = 0; };

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (splashPlaying()) { skipSplash(); return; } // any key skips the opening
  if (key === 'escape' && !playtest) { letGo(); onEscape(); return; }
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
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
// Taps, clicks and the on-screen stick. On the Level Complete card a tap goes on to the next level;
// otherwise it's tapAt, on whatever's under it.
initTouchControls(canvas, {
  onTap: (x, y) => isMenuOpen() ? undefined : gameState.status === 'won' ? nextLevel() : tapAt(screenToWorld(x, y)),
  onSwap: swapHeldLight,
  onRestart: restart,
  clampZoom,
  fitZoom,
});
// A wheel click is one step. Trackpads send a stream of small deltas, so those add up to a step.
let wheelTotal = 0;
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelTotal += e.deltaY;
  if (Math.abs(wheelTotal) < 50) return;
  zoomStep(wheelTotal < 0 ? 1 : -1);
  wheelTotal = 0;
}, { passive: false });

initMenu({ play, resume: () => {}, restart, levelCount: playLevels.length });

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
