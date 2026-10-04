import { MIRROR } from '../core/consts';
import { level } from '../core/state';
import type { MirrorState } from '../core/types';

// Turns a mirror a step; updateMirrors swings it there (asked mid-swing, it just goes further).
export const turnMirror = (m: MirrorState) => {
  m.turnLeft += 1;
  m.step = (m.step + 1) % MIRROR.steps;
};

// Swings mirrors toward their step with momentum: accelerating, then slowing to rest exactly on it.
// One step takes MIRROR.stepMs; longer turns get up to speed.
export const updateMirrors = (dt: number) => {
  const accel = 4 / (MIRROR.stepMs / 1000) ** 2; // steps/s²
  for (const m of level.mirrors) {
    if (m.turnLeft <= 0) continue;
    const stoppable = Math.sqrt(2 * accel * m.turnLeft); // the fastest that still stops in time
    m.turnSpeed = Math.min(stoppable, m.turnSpeed + accel * dt);
    const d = Math.min(m.turnLeft, Math.max(m.turnSpeed * dt, 1e-4));
    m.turnLeft -= d;
    m.shownStep = (m.shownStep + d) % MIRROR.steps;
    m.turned += d;
    if (m.turnLeft <= 1e-4) {
      m.shownStep = m.step;
      m.turned = Math.round(m.turned);
      m.turnLeft = m.turnSpeed = 0;
    }
    if (m.everSeen) m.seenStep = m.shownStep; // a mirror you know about, you see turn
  }
};
