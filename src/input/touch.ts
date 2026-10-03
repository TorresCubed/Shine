import { INPUT, CAMERA } from '../core/consts';
import { stick, input, camera } from '../core/state';
import { stickView } from '../ui/store';
import { clampZoom, fitZoom, pixelRatio } from '../render/canvases';

// Touch (and mouse) input on the game canvas. A press lifted within INPUT.tapSlop is a tap; dragged
// further it becomes the stick, centred where it went down. One finger can hold the stick while
// another taps; two put down together pinch-zoom and pan, as a right or middle mouse drag pans.
// The first touch sets input.touch, which shows the on-screen buttons.

export const initTouchControls = (canvas: HTMLCanvasElement, onTap: (clientX: number, clientY: number) => void) => {
  // Presses on the canvas: each pointer is a possible tap until it drags; at most one is the stick.
  // Two fingers down together (with no stick held) are a pinch/pan gesture instead.
  const presses = new Map<number, { x: number; y: number }>();
  let stickId: number | null = null;
  let centre = { x: 0, y: 0 };
  let gesture: { fingers: Map<number, { x: number; y: number }>; mid: { x: number; y: number }; dist: number } | null =
    null;

  const spread = (fingers: Map<number, { x: number; y: number }>) => {
    const [a, b] = [...fingers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };
  // Pinch zooms about the point between your fingers (it stays under them), and moving both fingers
  // drags the view: the world point under the old midpoint ends up under the new one.
  const moveGesture = (id: number, x: number, y: number) => {
    const g = gesture!;
    g.fingers.set(id, { x, y });
    const { mid, dist } = spread(g.fingers);
    const z0 = camera.zoom;
    const z1 = clampZoom((z0 * dist) / g.dist, true);
    const fromCentre = (p: { x: number; y: number }, axis: 'x' | 'y') =>
      (p[axis] - (axis === 'x' ? innerWidth : innerHeight) / 2) * pixelRatio;
    camera.panX += fromCentre(g.mid, 'x') / z0 - fromCentre(mid, 'x') / z1;
    camera.panY += fromCentre(g.mid, 'y') / z0 - fromCentre(mid, 'y') / z1;
    camera.zoom = z1;
    camera.fitted = false;
    g.mid = mid;
    g.dist = dist;
  };
  // Letting go settles on a whole zoom (so the art is crisp), or back on fitting the level if close.
  const endGesture = () => {
    gesture = null;
    camera.pinching = false;
    const fit = fitZoom();
    const z = camera.zoom;
    camera.fitted = Math.abs(z - fit) <= CAMERA.pinchFitSnap * fit;
    camera.zoom = camera.fitted ? fit : z >= 1 ? Math.round(z) : z;
  };

  const moveStick = (x: number, y: number) => {
    let dx = x - centre.x;
    let dy = y - centre.y;
    const len = Math.hypot(dx, dy);
    if (len > INPUT.stick.radius) {
      // Dragged past the edge: the ring follows the thumb, so turning round never needs a long drag back.
      centre = { x: x - (dx / len) * INPUT.stick.radius, y: y - (dy / len) * INPUT.stick.radius };
      dx = x - centre.x;
      dy = y - centre.y;
    }
    stick.x = dx / INPUT.stick.radius;
    stick.y = dy / INPUT.stick.radius;
    stickView.value = { centre, knob: { x: dx, y: dy } };
  };
  const releaseStick = () => {
    stickId = null;
    stick.x = stick.y = 0;
    stickView.value = null;
  };

  // A right or middle mouse drag moves the view, as two fingers do.
  let mousePan: { x: number; y: number } | null = null;
  const endMousePan = () => {
    mousePan = null;
    camera.pinching = false;
  };

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') input.touch.value = true;
    if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2) && !gesture) {
      e.preventDefault(); // no middle-click autoscroll
      canvas.setPointerCapture(e.pointerId);
      mousePan = { x: e.clientX, y: e.clientY };
      camera.pinching = true; // held where it's dragged to, and stopped at the level's edges
      camera.intro = false;
      return;
    }
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
  canvas.addEventListener('pointermove', e => {
    if (mousePan && e.pointerType === 'mouse') {
      camera.panX -= ((e.clientX - mousePan.x) * pixelRatio) / camera.zoom;
      camera.panY -= ((e.clientY - mousePan.y) * pixelRatio) / camera.zoom;
      mousePan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerId === stickId) return moveStick(e.clientX, e.clientY);
    if (gesture?.fingers.has(e.pointerId)) return moveGesture(e.pointerId, e.clientX, e.clientY);
    const start = presses.get(e.pointerId);
    if (!start || stickId !== null || Math.hypot(e.clientX - start.x, e.clientY - start.y) <= INPUT.tapSlop) return;
    presses.delete(e.pointerId);
    stickId = e.pointerId;
    centre = start;
    moveStick(e.clientX, e.clientY);
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (mousePan && e.pointerType === 'mouse') return endMousePan();
    if (e.pointerId === stickId) return releaseStick();
    if (gesture?.fingers.has(e.pointerId)) return endGesture(); // the other finger then does nothing till lifted
    const start = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (start && !cancelled && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= INPUT.tapSlop)
      onTap(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', e => end(e, false));
  canvas.addEventListener('pointercancel', e => end(e, true));
  window.addEventListener('blur', () => {
    releaseStick();
    presses.clear();
    if (gesture) endGesture();
    if (mousePan) endMousePan();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault()); // long-press menu
};
