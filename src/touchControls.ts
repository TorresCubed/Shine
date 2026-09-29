import { STICK_RADIUS, TAP_SLOP, PINCH_FIT_SNAP } from "./consts";
import { stick, input, lightState, gameState, camera, keysDown } from "./state";

// Touch (and mouse) input on the game canvas. Every press starts out as a possible tap; lifted
// without moving more than TAP_SLOP it's a tap (onTap), but dragged further it becomes the stick,
// centred where it went down, so the stick can be anywhere and never hides the level. Several
// fingers at once: one can hold the stick while another taps; two put down together pinch to zoom
// and drag the view (camera.pan). Once touch is used, on-screen buttons
// appear for what's otherwise on keys (swap lights, restart, and Q/E to aim the flashlight).

type Handlers = {
  onTap: (clientX: number, clientY: number) => void; onSwap: () => void; onRestart: () => void;
  clampZoom: (zoom: number, free?: boolean) => number; fitZoom: () => number;
};

const el = (tag: string, css: string, parent: HTMLElement = document.body) => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  parent.appendChild(e);
  return e;
}

export const initTouchControls = (canvas: HTMLCanvasElement, { onTap, onSwap, onRestart, clampZoom, fitZoom }: Handlers) => {
  // The stick: a ring where it went down and a knob under your thumb. Drawn only while held.
  const knobSize = STICK_RADIUS * 0.8;
  const base = el('div', `position:fixed; left:0; top:0; width:${STICK_RADIUS * 2}px; height:${STICK_RADIUS * 2}px;
    margin:${-STICK_RADIUS}px 0 0 ${-STICK_RADIUS}px; border-radius:50%; border:2px solid rgba(255,255,255,0.25);
    background:rgba(255,255,255,0.06); box-sizing:border-box; pointer-events:none; display:none;`);
  const knob = el('div', `position:absolute; left:50%; top:50%; width:${knobSize}px; height:${knobSize}px;
    margin:${-knobSize / 2}px 0 0 ${-knobSize / 2}px; border-radius:50%; background:rgba(255,255,255,0.3);`, base);

  // Presses on the canvas: each pointer is a possible tap until it drags; at most one is the stick.
  // Two fingers down together (with no stick held) are a pinch/pan gesture instead.
  const presses = new Map<number, { x: number; y: number }>();
  let stickId: number | null = null;
  let centre = { x: 0, y: 0 };
  let gesture: { fingers: Map<number, { x: number; y: number }>; mid: { x: number; y: number }; dist: number } | null = null;

  const spread = (fingers: Map<number, { x: number; y: number }>) => {
    const [a, b] = [...fingers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  // Pinch zooms about the point between your fingers (it stays under them), and moving both fingers
  // drags the view: the world point under the old midpoint ends up under the new one.
  const moveGesture = (id: number, x: number, y: number) => {
    const g = gesture!;
    g.fingers.set(id, { x, y });
    const { mid, dist } = spread(g.fingers);
    const pr = window.devicePixelRatio || 1;
    const z0 = camera.zoom, z1 = clampZoom(z0 * dist / g.dist, true);
    const fromCentre = (p: { x: number; y: number }, axis: 'x' | 'y') => (p[axis] - (axis === 'x' ? innerWidth : innerHeight) / 2) * pr;
    camera.panX += fromCentre(g.mid, 'x') / z0 - fromCentre(mid, 'x') / z1;
    camera.panY += fromCentre(g.mid, 'y') / z0 - fromCentre(mid, 'y') / z1;
    camera.zoom = z1;
    camera.fitted = false;
    g.mid = mid;
    g.dist = dist;
  }
  // Letting go settles on a whole zoom (so the art is crisp), or back on fitting the level if close.
  const endGesture = () => {
    gesture = null;
    camera.pinching = false;
    const fit = fitZoom(), z = camera.zoom;
    camera.fitted = Math.abs(z - fit) <= PINCH_FIT_SNAP * fit;
    camera.zoom = camera.fitted ? fit : z >= 1 ? Math.round(z) : z;
  }

  const moveStick = (x: number, y: number) => {
    let dx = x - centre.x, dy = y - centre.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      // Dragged past the edge: the ring follows the thumb, so turning round never needs a long drag back.
      centre = { x: x - dx / len * STICK_RADIUS, y: y - dy / len * STICK_RADIUS };
      dx = x - centre.x; dy = y - centre.y;
    }
    stick.x = dx / STICK_RADIUS;
    stick.y = dy / STICK_RADIUS;
    base.style.transform = `translate(${centre.x}px, ${centre.y}px)`;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  const releaseStick = () => {
    stickId = null;
    stick.x = stick.y = 0;
    base.style.display = 'none';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') showButtons();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId); // keep getting its moves even off the canvas
    presses.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (presses.size === 2 && stickId === null && !gesture) {
      const fingers = new Map(presses);
      presses.clear(); // neither is a tap now
      gesture = { fingers, ...spread(fingers) };
      camera.pinching = true;
      camera.intro = false; // zooming yourself cancels a new level's zoom-in
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) return moveStick(e.clientX, e.clientY);
    if (gesture?.fingers.has(e.pointerId)) return moveGesture(e.pointerId, e.clientX, e.clientY);
    const start = presses.get(e.pointerId);
    if (!start || stickId !== null || Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP) return;
    presses.delete(e.pointerId);
    stickId = e.pointerId;
    centre = start;
    base.style.display = 'block';
    moveStick(e.clientX, e.clientY);
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId === stickId) return releaseStick();
    if (gesture?.fingers.has(e.pointerId)) return endGesture(); // the other finger then does nothing till lifted
    const start = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (start && !cancelled && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP) onTap(e.clientX, e.clientY);
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  window.addEventListener('blur', () => { releaseStick(); presses.clear(); if (gesture) endGesture(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu

  // Buttons, top right, clear of notches. Swap only shows while you've a light in your pocket.
  const bar = el('div', `position:fixed; top:calc(env(safe-area-inset-top) + 12px); right:calc(env(safe-area-inset-right) + 12px);
    display:none; gap:10px;`);
  const makeButton = (label: string, title: string, parent: HTMLElement) => {
    const b = el('button', `width:48px; height:48px; border-radius:50%; border:2px solid rgba(255,255,255,0.25);
      background:rgba(0,0,0,0.45); color:rgba(255,255,255,0.8); font:22px sans-serif; padding:0;
      touch-action:none; user-select:none; -webkit-user-select:none; -webkit-tap-highlight-color:transparent;`, parent) as HTMLButtonElement;
    b.textContent = label;
    b.title = b.ariaLabel = title;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }
  const button = (label: string, title: string, onPress: () => void) => {
    const b = makeButton(label, title, bar);
    b.addEventListener('click', (e) => { e.stopPropagation(); onPress(); b.blur(); });
    return b;
  }
  const swap = button('⇄', 'Swap lights', onSwap);
  button('↻', 'Restart level', onRestart);

  // Aiming the flashlight, bottom centre, only while it's in your hand: hold one to turn it, as Q/E
  // do (slow at first for fine aim, speeding up while held; standing still only).
  const aimBar = el('div', `position:fixed; left:50%; transform:translateX(-50%);
    bottom:calc(env(safe-area-inset-bottom) + 16px); display:none; gap:28px;`);
  const holdButton = (label: string, title: string, key: string) => {
    const b = makeButton(label, title, aimBar);
    b.style.width = b.style.height = '56px';
    const release = () => keysDown.delete(key);
    b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); keysDown.add(key); });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    return release;
  }
  const aimReleases = [holdButton('⟲', 'Turn flashlight left', 'q'), holdButton('⟳', 'Turn flashlight right', 'e')];

  function showButtons() {
    if (input.touch) return;
    input.touch = true;
    bar.style.display = 'flex';
    const sync = () => {
      swap.style.visibility = lightState.stowed.length && gameState.status === 'playing' ? 'visible' : 'hidden';
      const aiming = lightState.held === 'flashlight' && gameState.status === 'playing';
      if (!aiming && aimBar.style.display !== 'none') aimReleases.forEach(r => r()); // hidden mid-hold: let go
      aimBar.style.display = aiming ? 'flex' : 'none';
      requestAnimationFrame(sync);
    };
    sync();
  }
}
