import { cellCenter } from "../core/util";
import { insideAny, brightnessAt } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import type { Point } from "../core/types";
import { SPRITES, PLATE } from "../core/consts";
import { player, doors, lightState } from "../core/state";
import { worldCtx } from "./canvases";
import { frameTime, viewMode } from "./frame";
import { drawObject, playerSprites } from "./art";
import type { ObjectKind } from "./art";
import { drawShines } from "./effects";

// Lit plates in line of sight wake (over PLATE.wakeMs) into their door's kind of active, drawn over
// the darkness at full art rather than as lit as the floor, so they shine. Going dark they wink
// out: shift to dead (still shining), flare, and fade into the dark.
export const drawAwakePlates = (view: Point[][]) => {
  const c = worldCtx;
  for (const door of doors) {
    if (door.kind === 'lever') continue;
    const at = cellCenter(door.trigger), active: ObjectKind = door.kind === 'locked' ? 'plateActiveLock' : 'plateActiveStd';
    const wink = frameTime - door.winkAt, winking = wink < PLATE.wink.shiftMs + PLATE.wink.flareMs + PLATE.wink.fadeMs;
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
      c.globalAlpha = from * PLATE.wink.flare * Math.sin(Math.PI * t / PLATE.wink.flareMs);
      drawObject(c, 'plateDead', at.x, at.y, 0, false);
      c.globalCompositeOperation = 'source-over';
    }
  }
  c.globalAlpha = 1;
}

// Dropped lights in line of sight, lights waiting to be found where they're lit and in sight (at
// full art, the same as a dropped one, so they stand out), then the player.
export const drawObjects = (view: Point[][], groups: LightGroup[]) => {
  for (const d of lightState.dropped) {
    if (viewMode === 'normal' && !insideAny(d, view)) continue;
    drawObject(worldCtx, d.kind, d.x, d.y, d.kind === 'flashlight' ? d.aimAngle : 0, false);
  }
  for (const p of lightState.pickups) {
    if (viewMode === 'normal' && !(insideAny(p, view) && brightnessAt(p, groups) > 0)) continue;
    drawObject(worldCtx, p.kind, p.x, p.y, p.aimAngle, false);
  }
  const spriteKind = lightState.held ?? 'empty';
  const { anchor } = SPRITES.player[spriteKind];
  worldCtx.save();
  worldCtx.translate(player.x, player.y);
  worldCtx.rotate(player.aimAngle);
  worldCtx.scale(SPRITES.playerScale, SPRITES.playerScale);
  worldCtx.imageSmoothingEnabled = false;
  worldCtx.drawImage(playerSprites[spriteKind], -anchor.x, -anchor.y);
  worldCtx.restore();
  drawShines(worldCtx);
}
