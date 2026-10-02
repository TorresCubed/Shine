import { lightState, input } from "./state";
import type { LightKind } from "./interfaces";
import candleUrl from "./assets/interactive/droppedCandle.png";
import flashlightUrl from "./assets/interactive/droppedFlashlight.png";

// What you're carrying, top left beside the menu button while you play: the light in your hand, and
// the one in your pocket (switched off, so dimmer), or an empty slot. Clicking or tapping the pocket
// swaps them, as F does. Both slots pop when what's in them changes.

// Each light's art, cropped to the light itself: where it sits in its 64px image, and how big to show it.
const ICONS: Record<LightKind, { url: string; x: number; y: number; w: number; h: number; scale: number }> = {
  candle: { url: candleUrl, x: 25, y: 25, w: 14, h: 14, scale: 2 },
  flashlight: { url: flashlightUrl, x: 13, y: 20, w: 32, h: 18, scale: 1 },
};

const el = (tag: string, cls: string, parent?: HTMLElement) => {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

const root = el('div', 'hud');
const slot = (name: string, label: string) => {
  const s = el(name === 'pocket' ? 'button' : 'div', `hud-slot hud-${name}`, root);
  const icon = el('div', 'hud-icon', s);
  const caption = el('span', 'hud-label', s);
  caption.textContent = label;
  return { s, icon, caption, shows: undefined as LightKind | null | undefined };
}
const hand = slot('hand', 'Hand');
const pocket = slot('pocket', 'F');

const show = (target: typeof hand, kind: LightKind | null) => {
  if (target.shows === kind) return;
  const first = target.shows === undefined;
  target.shows = kind;
  target.s.classList.toggle('empty', !kind);
  if (kind) {
    const i = ICONS[kind];
    Object.assign(target.icon.style, {
      backgroundImage: `url("${i.url}")`,
      width: `${i.w * i.scale}px`, height: `${i.h * i.scale}px`,
      backgroundSize: `${64 * i.scale}px ${64 * i.scale}px`,
      backgroundPosition: `${-i.x * i.scale}px ${-i.y * i.scale}px`,
    });
  } else target.icon.removeAttribute('style');
  if (first) return;
  target.s.classList.remove('pop');
  void target.s.offsetWidth; // (restarts the animation)
  target.s.classList.add('pop');
}

// `visible`: whether a level's being played (not the title or a menu). `swap` swaps lights.
export const initHud = (visible: () => boolean, swap: () => void) => {
  document.body.append(root);
  pocket.s.title = pocket.s.ariaLabel = 'Swap lights';
  pocket.s.addEventListener('click', () => { (pocket.s as HTMLButtonElement).blur(); swap(); });
  const sync = () => {
    root.classList.toggle('shown', visible());
    show(hand, lightState.held);
    show(pocket, lightState.stowed[0] ?? null);
    pocket.caption.textContent = input.touch ? '⇄' : 'F';
    requestAnimationFrame(sync);
  };
  sync();
}
