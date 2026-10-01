import { GAME_TITLE, TAGLINE, AUTHOR, LINKS, CREDITS } from "./about";
import { LEVEL_TITLES, CHAPTERS, CONTROLS, chapterOf } from "./levelInfo";
import { isCompleted, completedCount, lastPlayed, resetProgress } from "./progress";
import { input } from "./state";

// The menus: an HTML overlay over the game canvas (which keeps drawing behind it), so text is crisp
// and buttons work alike by mouse, touch and keyboard (Tab / Enter, Esc to go back). While it's open
// it takes every press, and main.ts ignores game keys. Screens open from one another and Back (or
// Esc) returns to the one before; the title and the ending have nothing behind them.
// During play: a menu button (top left), a hint line (bottom) and a level card (top) as each level
// starts.

type Screen = 'title' | 'levels' | 'howto' | 'credits' | 'pause' | 'ending';
type Handlers = {
  play: (index: number) => void;  // start level `index` (from 0)
  resume: () => void;             // back to the level in progress
  restart: () => void;
  levelCount: number;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

let handlers: Handlers;
const overlay = el('div', 'menu-overlay');
const panel = el('div', 'menu-panel');
const menuButton = el('button', 'menu-button', '☰');
const hint = el('div', 'hint');
const levelCard = el('div', 'level-card');
let stack: Screen[] = [];

export const isMenuOpen = () => stack.length > 0;

const button = (label: string, onClick: () => void, cls = '') => {
  const b = el('button', `menu-item ${cls}`.trim(), label);
  b.addEventListener('click', onClick);
  return b;
}
const back = () => button('Back', goBack, 'menu-back');

const levelLabel = (index: number) => `Level ${index + 1} · ${LEVEL_TITLES[index] ?? ''}`;

const screens: Record<Screen, () => HTMLElement[]> = {
  title: () => {
    const last = lastPlayed();
    const items: HTMLElement[] = [el('h1', 'game-title', GAME_TITLE), el('p', 'tagline', TAGLINE)];
    const list = el('div', 'menu-list');
    if (last !== null && last >= 1 && last <= handlers.levelCount) {
      list.append(button(`Continue: ${levelLabel(last - 1)}`, () => handlers.play(last - 1), 'primary'));
      list.append(button('Play from the start', () => handlers.play(0)));
    } else {
      list.append(button('Play', () => handlers.play(0), 'primary'));
    }
    list.append(button('Levels', () => open('levels')), button('How to Play', () => open('howto')), button('Credits', () => open('credits')));
    items.push(list, el('p', 'byline', `by ${AUTHOR}`));
    return items;
  },

  levels: () => {
    const done = completedCount();
    const items: HTMLElement[] = [el('h2', '', 'Levels'), el('p', 'muted', `${done} of ${handlers.levelCount} finished`)];
    const scroll = el('div', 'level-scroll');
    for (const chapter of CHAPTERS) {
      scroll.append(el('h3', 'chapter', chapter.name));
      const grid = el('div', 'level-grid');
      for (let n = chapter.first; n <= Math.min(chapter.last, handlers.levelCount); n++) {
        const b = button('', () => handlers.play(n - 1), `level-tile${isCompleted(n) ? ' done' : ''}`);
        b.append(el('span', 'level-number', String(n)), el('span', 'level-name', LEVEL_TITLES[n - 1] ?? ''));
        if (isCompleted(n)) b.append(el('span', 'level-check', '✓'));
        b.title = levelLabel(n - 1);
        grid.append(b);
      }
      scroll.append(grid);
    }
    items.push(scroll);
    const row = el('div', 'menu-row');
    if (done > 0) row.append(button('Reset progress', () => {
      if (confirm('Forget which levels you\'ve finished?')) { resetProgress(); render(); }
    }, 'quiet'));
    row.append(back());
    items.push(row);
    return items;
  },

  howto: () => {
    const items: HTMLElement[] = [el('h2', '', 'How to Play')];
    const rules = el('div', 'rules');
    for (const line of [
      'Find the stairs down out of each room.',
      'You\'re afraid of the dark: carrying a light, you can go anywhere, but put it down and you can only walk where it\'s lit.',
      'Light opens doors: shine on a door\'s plate and it opens, for as long as the light stays on it.',
      'Lights you put down keep shining, so you can be in two places at once.',
    ]) rules.append(el('p', '', line));
    items.push(rules);
    const table = el('table', 'controls');
    const head = el('tr');
    head.append(el('th', '', ''), el('th', '', 'Keyboard'), el('th', '', 'Touch'));
    table.append(head);
    for (const c of CONTROLS) {
      const row = el('tr');
      row.append(el('td', 'does', c.does), el('td', 'key', c.keys), el('td', 'key', c.touch));
      table.append(row);
    }
    items.push(table, back());
    return items;
  },

  credits: () => {
    const items: HTMLElement[] = [el('h2', '', 'Credits'), ...creditsList(), linksList(), back()];
    return items;
  },

  pause: () => {
    const list = el('div', 'menu-list');
    list.append(
      button('Resume', resume, 'primary'),
      button('Restart level', () => { close(); handlers.restart(); }),
      button('Levels', () => open('levels')),
      button('How to Play', () => open('howto')),
      button('Title screen', () => { stack = []; open('title'); }),
    );
    return [el('h2', '', 'Paused'), list];
  },

  ending: () => {
    const items: HTMLElement[] = [
      el('h1', 'game-title', 'The End'),
      el('p', 'tagline', `You found your way out. ${completedCount()} of ${handlers.levelCount} levels finished.`),
      el('p', 'muted', 'Thanks for playing.'),
      ...creditsList(), linksList(),
    ];
    const list = el('div', 'menu-list');
    list.append(button('Levels', () => open('levels')), button('Title screen', () => { stack = []; open('title'); }));
    items.push(list);
    return items;
  },
};

const creditsList = () => {
  const list = el('dl', 'credits');
  for (const c of CREDITS) list.append(el('dt', '', c.role), el('dd', '', c.who));
  return [list];
}
const linksList = () => {
  const row = el('div', 'links');
  for (const l of [...LINKS, { label: 'Level editor', url: 'editor.html' }]) {
    if (!l.url) continue;
    const a = el('a', '', l.label);
    a.href = l.url;
    if (/^https?:/.test(l.url)) { a.target = '_blank'; a.rel = 'noopener'; }
    row.append(a);
  }
  return row;
}

const render = () => {
  const screen = stack[stack.length - 1];
  overlay.classList.toggle('open', !!screen);
  menuButton.classList.toggle('shown', !screen && started);
  if (!screen) return;
  overlay.dataset.screen = screen;
  panel.replaceChildren(...screens[screen]());
  panel.scrollTop = 0;
  (panel.querySelector('.primary, .menu-item, .level-tile') as HTMLElement | null)?.focus({ preventScroll: true });
}

// Opens `screen` on top of whatever's open (Back returns to it).
export const open = (screen: Screen) => {
  hideHint();
  stack.push(screen);
  render();
}
const goBack = () => {
  const screen = stack[stack.length - 1];
  if (screen === 'title' || screen === 'ending') return; // nothing behind them
  stack.pop();
  if (stack.length === 0) handlers.resume();
  render();
}
// Closes every screen (a level is starting, or play resumes).
export const close = () => {
  stack = [];
  render();
}
const resume = () => { close(); handlers.resume(); };

// Esc: back a screen, or open the pause menu during play.
export const onEscape = () => {
  if (!isMenuOpen()) { if (started) open('pause'); return; }
  goBack();
}

let started = false; // a level has been started from the menus (so the menu button shows)
export const markStarted = () => { started = true; render(); };

// A hint along the bottom, until `ms` is up or the level ends.
let hintTimer: ReturnType<typeof setTimeout> | undefined;
export const showHint = (text: { keys: string; touch: string }, ms = 12000) => {
  // (Touch is known for sure once the game's been touched; before that, by the kind of pointer.)
  const touch = input.touch || matchMedia('(pointer: coarse)').matches;
  hint.textContent = touch ? text.touch : text.keys;
  hint.classList.toggle('touch', touch);
  hint.classList.add('shown');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, ms);
}
export const hideHint = () => { clearTimeout(hintTimer); hint.classList.remove('shown'); };

// The level's number, chapter and name, across the top for a few seconds as it starts.
let cardTimer: ReturnType<typeof setTimeout> | undefined;
export const showLevelCard = (index: number) => {
  const n = index + 1, chapter = chapterOf(n);
  levelCard.replaceChildren(el('span', 'card-chapter', chapter ? `${chapter.name} · Level ${n}` : `Level ${n}`), el('span', 'card-title', LEVEL_TITLES[index] ?? ''));
  levelCard.classList.add('shown');
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => levelCard.classList.remove('shown'), 3500);
}

export const initMenu = (h: Handlers) => {
  handlers = h;
  overlay.append(panel);
  document.body.append(overlay, menuButton, hint, levelCard);
  menuButton.title = menuButton.ariaLabel = 'Menu';
  menuButton.addEventListener('click', () => { menuButton.blur(); open('pause'); });
  // Presses on the overlay's backdrop don't reach the game underneath.
  overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
  if (LEVEL_TITLES.length !== h.levelCount) console.warn(`levelInfo has ${LEVEL_TITLES.length} level titles for ${h.levelCount} levels`);
}
