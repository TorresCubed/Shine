import { cellCenter } from '../core/util';
import { insideAny, brightnessAt } from '../light/brightness';
import type { LightGroup } from '../light/rayTracer';
import type { Point } from '../core/types';
import { GRID_SIZE, SPRITES, PLATE } from '../core/consts';
import { level, player, lightState } from '../core/state';
import { worldCtx } from './canvases';
import { frameTime, viewMode } from './frame';
import { drawObject, playerSprites } from './art';
import type { ObjectKind } from './art';
import { drawShines } from './effects';

// Lit plates in sight wake (over PLATE.wakeMs) into their active art, drawn over the dark so they
// shine. Going dark, they shift to dead, flare and fade.
export const drawAwakePlates = (view: Point[][]) => {
  const c = worldCtx;
  for (const door of level.doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger);
    const active: ObjectKind = door.kind === 'locked' ? 'plateActiveLock' : 'plateActiveStd';
    const wink = frameTime - door.winkAt;
    const winking = wink < PLATE.wink.shiftMs + PLATE.wink.flareMs + PLATE.wink.fadeMs;
    if (door.plateWake === 0 && !winking) continue;
    if (viewMode === 'normal' && !insideAny(at, view)) continue;
    if (door.plateWake > 0) {
      c.globalAlpha = door.plateWake / PLATE.wakeMs;
      drawObject(c, active, at.x, at.y, 0, false);
      continue;
    }
    const from = door.winkFrom;
    if (wink < PLATE.wink.shiftMs) {
      c.globalAlpha = from;
      drawObject(c, 'plateDead', at.x, at.y, 0, false);
      c.globalAlpha = from * (1 - wink / PLATE.wink.shiftMs);
      drawObject(c, active, at.x, at.y, 0, false);
      continue;
    }
    const t = wink - PLATE.wink.shiftMs;
    c.globalAlpha = from * (t < PLATE.wink.flareMs ? 1 : 1 - (t - PLATE.wink.flareMs) / PLATE.wink.fadeMs);
    drawObject(c, 'plateDead', at.x, at.y, 0, false);
    if (t < PLATE.wink.flareMs) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = from * PLATE.wink.flare * Math.sin((Math.PI * t) / PLATE.wink.flareMs);
      drawObject(c, 'plateDead', at.x, at.y, 0, false);
      c.globalCompositeOperation = 'source-over';
    }
  }
  c.globalAlpha = 1;
};

// The trinket: a stand-in locket until it has art.
const drawTrinket = (at: Point) => {
  const c = worldCtx;
  const r = GRID_SIZE * 0.12;
  c.strokeStyle = '#7a5a22';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(at.x, at.y - r * 1.6, r * 0.45, 0, Math.PI * 2); // the loop it hangs from
  c.stroke();
  c.fillStyle = '#d9b55a';
  c.beginPath();
  c.arc(at.x, at.y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#fff3c4';
  c.fillRect(Math.round(at.x - r * 0.45), Math.round(at.y - r * 0.45), 3, 3); // a glint
};

// Dropped lights in sight, unfound ones lit and in sight (at full art, to stand out), then the player.
export const drawObjects = (view: Point[][], groups: LightGroup[]) => {
  for (const d of lightState.dropped) {
    if (viewMode === 'normal' && !insideAny(d, view)) continue;
    drawObject(worldCtx, d.kind, d.x, d.y, d.kind === 'flashlight' ? d.aimAngle : 0, false);
  }
  for (const p of lightState.pickups) {
    if (viewMode === 'normal' && !(insideAny(p, view) && brightnessAt(p, groups) > 0)) continue;
    drawObject(worldCtx, p.kind, p.x, p.y, p.aimAngle, false);
  }
  if (level.trinket) {
    const at = cellCenter(level.trinket);
    if (viewMode !== 'normal' || (insideAny(at, view) && brightnessAt(at, groups) > 0)) drawTrinket(at);
  }
  const spriteKind = lightState.held.value ?? 'empty';
  const { anchor } = SPRITES.player[spriteKind];
  worldCtx.save();
  worldCtx.translate(player.x, player.y);
  worldCtx.rotate(player.aimAngle);
  worldCtx.scale(SPRITES.playerScale, SPRITES.playerScale);
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.drawImage(playerSprites[spriteKind], -anchor.x, -anchor.y);
  worldCtx.restore();
  drawShines(worldCtx);
};
