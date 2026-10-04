import { PLAYER } from '../core/consts';
import { player, keysDown, gameState } from '../core/state';
import { wrapAngle } from '../core/util';

// The flashlight turns to face the way you walk (`walkAngle`, null standing still). Standing still,
// Q/E aim it, slow at first and ramping up while held.
let turnDir = 0;
let turnHeldMs = 0;
export const updateAim = (dt: number, walkAngle: number | null) => {
  if (gameState.status.value !== 'playing') return;
  if (walkAngle !== null) {
    const off = wrapAngle(walkAngle - player.aimAngle);
    const maxTurn = ((PLAYER.turnDegPerS * Math.PI) / 180) * dt;
    player.aimAngle += Math.max(-maxTurn, Math.min(maxTurn, off));
    turnDir = 0;
    return;
  }
  const turn = (keysDown.has('e') ? 1 : 0) - (keysDown.has('q') ? 1 : 0);
  if (turn !== turnDir) {
    turnDir = turn;
    turnHeldMs = 0;
  }
  if (turn === 0) return;
  turnHeldMs += dt * 3000;
  const ramp = Math.min(1, turnHeldMs / PLAYER.aim.rampMs) ** 2;
  const degPerS = PLAYER.aim.minDegPerS + (PLAYER.aim.maxDegPerS - PLAYER.aim.minDegPerS) * ramp;
  player.aimAngle += ((turn * degPerS * Math.PI) / 180) * dt;
};
