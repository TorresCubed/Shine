import { tryMove } from '../game/movement';
import { updateAim } from '../game/aim';
import { updateMirrors } from '../game/mirrors';
import { updateDoors } from '../game/doors';
import { getScene } from '../light/scene';
import type { LightGroup } from '../light/rayTracer';
import type { LightKind } from '../core/types';
import { TARGET_FPS, FOG, CAMERA } from '../core/consts';
import { level, allDoorLeaves, lightState, camera } from '../core/state';
import { canvas, ctx, pixelRatio, worldCtx, litLayer, litCtx, regionLayer } from './canvases';
import { setFrameTime, viewMode } from './frame';
import { skip, perfMark, perfFrameStart, perfFrameEnd, countFrame, drawHud } from './debug';
import { intersect, unionBounds, copyRect } from './geometry';
import type { Bounds } from './geometry';
import { castLights } from './lights';
import { computeView, drawViewMask, mirrorSeen } from './sight';
import { fadeMemory, rememberSeen, rememberEverything, getMemoryMask } from './memory';
import { boundsOf, clearLightMaps, drawLightMap, drawLightTint, glowLayer, glowCtx } from './lightMap';
import { ensureDimFloor, dimFloorCanvas, dimMarksCanvas, ensureLitArt, litArt, drawBrightLevel } from './floor';
import { drawLockFlashes, updateDust, drawDust } from './effects';
import { drawAwakePlates, drawObjects } from './objects';
import { updateCamera, visibleRect, drawToScreen } from './camera';
import { drawTransition } from './transition';

const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = -Infinity;

// Last frame's light, for the fear rule, unless the held light has changed since (e.g. just dropped).
let litGroups: LightGroup[] = [];
let litGroupsHeld: LightKind | null = null;

export const draw = (now: number) => {
  requestAnimationFrame(draw);

  // Frame cap, with 1ms slack for rAF jitter.
  const elapsed = now - lastFrameTime;
  if (elapsed < FRAME_INTERVAL - 1) return;
  const dt = Math.min(elapsed, 100) / 1000; // clamped so a backgrounded tab doesn't teleport the player
  lastFrameTime = now;
  setFrameTime(now);
  countFrame(now);

  perfFrameStart();
  const walkAngle = tryMove(dt, litGroupsHeld === lightState.held.value ? litGroups : []);
  updateAim(dt, walkAngle);
  // Walking brings a panned view back to you.
  if (walkAngle !== null && !camera.pinching) {
    const keep = Math.exp(-CAMERA.panReturn * dt);
    camera.panX *= keep;
    camera.panY *= keep;
  }
  updateMirrors(dt);
  updateDust(dt);
  perfMark('move');

  const scene = getScene(level.walls, level.mirrors, allDoorLeaves());
  const { groups, rayCount, lightCount } = castLights(scene, now);
  perfMark('cast');
  litGroups = groups;
  litGroupsHeld = lightState.held.value;

  // Light reaches everywhere for play, but you only see and remember what's in line of sight.
  const view = computeView(scene);
  perfMark('view');
  updateDoors(groups, view, dt);
  for (const m of level.mirrors)
    if (mirrorSeen(m, groups, view)) {
      m.seenStep = m.shownStep;
      m.everSeen = true;
    }
  if (viewMode !== 'normal') {
    for (const d of level.doors) d.seenOpenAmount = d.openAmount;
    for (const m of level.mirrors) m.seenStep = m.shownStep;
  }
  perfMark('logic');
  fadeMemory(dt);
  perfMark('fade');
  rememberSeen(groups, view, !skip.has('memory'));
  if (viewMode === 'fog') rememberEverything();
  perfMark('memory');
  updateCamera(dt);
  const vis = visibleRect();

  // Only lights on screen are drawn.
  const bounds = groups.map(g => intersect(boundsOf(g), vis));
  const onScreen = groups.map((_, i) => bounds[i].w > 0 && bounds[i].h > 0);
  const litBounds = bounds.filter((_, i) => onScreen[i]).reduce(unionBounds, { x: vis.x, y: vis.y, w: 0, h: 0 });
  const anyLit = litBounds.w > 0 && litBounds.h > 0;
  clearLightMaps(litBounds);
  let glowDrawn = false; // anything in the glow map this frame
  if (viewMode === 'bright') {
    // Everything lit, with each light's reach as a tint.
    drawBrightLevel(worldCtx);
    litCtx.globalCompositeOperation = 'lighter';
    groups.forEach((g, i) => {
      if (onScreen[i]) {
        drawLightTint(g, bounds[i]);
        copyRect(litCtx, regionLayer, bounds[i]);
      }
    });
    litCtx.globalCompositeOperation = 'source-over';
    worldCtx.globalAlpha = 0.55;
    copyRect(worldCtx, litLayer, litBounds);
    worldCtx.globalAlpha = 1;
  } else {
    // Remembered floor: the dim floor (scaled to FOG.visibility; at 0, just what's on it) times the fog
    // memory (upscaled, softening its edges), plus the base darkness added on top. The playtest's fog
    // view always shows the fog floor.
    const fog = viewMode === 'fog' ? FOG.floorBrightness : FOG.visibility;
    ensureDimFloor();
    const S = FOG.memoryScale;
    worldCtx.fillStyle = 'black';
    worldCtx.fillRect(vis.x, vis.y, vis.w, vis.h);
    if (!skip.has('fog')) {
      worldCtx.globalAlpha = fog > 0 ? Math.min(1, fog / FOG.floorBrightness) : 1;
      copyRect(worldCtx, fog > 0 ? dimFloorCanvas : dimMarksCanvas, vis);
      worldCtx.globalAlpha = 1;
      worldCtx.globalCompositeOperation = 'multiply';
      worldCtx.drawImage(getMemoryMask(), vis.x * S, vis.y * S, vis.w * S, vis.h * S, vis.x, vis.y, vis.w, vis.h);
      worldCtx.globalCompositeOperation = 'lighter';
      worldCtx.fillStyle = '#141110';
      worldCtx.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    worldCtx.globalCompositeOperation = 'source-over';
    perfMark('fog');

    // Lights add ('lighter'), then are cut to the line of sight and laid over the remembered floor.
    litCtx.globalCompositeOperation = 'lighter';
    if (!skip.has('lit'))
      groups.forEach((g, i) => {
        if (onScreen[i] && drawLightMap(g, bounds[i])) glowDrawn = true;
      });
    perfMark('lit');
    if (viewMode === 'normal' && anyLit && !skip.has('sight')) {
      // (Kept to the lit area: 'destination-in' would otherwise clear the whole canvas outside it.)
      const mask = drawViewMask(view, litBounds);
      layInto(litCtx, mask, 'destination-in', litBounds);
      if (glowDrawn) layInto(glowCtx, mask, 'destination-in', litBounds);
    }
    // The lit art laid into the light map, and dust on it, then the lot over the remembered floor.
    if (anyLit && !skip.has('floor')) {
      ensureLitArt();
      layInto(litCtx, litArt, 'source-in', litBounds, () => {
        litCtx.globalCompositeOperation = 'source-atop';
        drawDust(litCtx, litBounds);
      });
    }
    litCtx.globalCompositeOperation = 'source-over';
    copyRect(worldCtx, litLayer, litBounds);
    // The glow: the lit art laid into the glow map, added on top.
    if (glowDrawn && anyLit && !skip.has('floor')) {
      layInto(glowCtx, litArt, 'source-in', litBounds);
      worldCtx.globalCompositeOperation = 'lighter';
      copyRect(worldCtx, glowLayer, litBounds);
      worldCtx.globalCompositeOperation = 'source-over';
    }
    perfMark('sight');
  }

  drawLockFlashes(worldCtx);
  drawAwakePlates(view);
  if (!skip.has('objects')) drawObjects(view, groups);
  perfMark('objects');

  if (!skip.has('screen')) drawToScreen();
  else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  drawTransition(now);
  perfMark('screen');
  perfFrameEnd();
  drawHud(rayCount, lightCount, groups.length);
};

// Composites `from` into `c` with `op`, clipped to `b` (the 'source-in' and 'destination-in' ops
// would otherwise clear the whole canvas outside it), then runs `more` under the same clip.
const layInto = (
  c: CanvasRenderingContext2D,
  from: HTMLCanvasElement,
  op: GlobalCompositeOperation,
  b: Bounds,
  more?: () => void,
) => {
  c.save();
  c.beginPath();
  c.rect(b.x, b.y, b.w, b.h);
  c.clip();
  c.globalCompositeOperation = op;
  copyRect(c, from, b);
  more?.();
  c.restore();
};
