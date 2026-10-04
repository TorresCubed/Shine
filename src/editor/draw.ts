import { LIGHT } from '../core/consts';
import { polygonsPath } from '../core/util';
import type { LightGroup } from '../light/rayTracer';
import { drawCell } from './cells';
import { drawDoors } from './doors';
import { canvas, ctx, ed } from './model';
import { drawOverlays } from './overlays';

// Offscreen layers: the map, one light's reach, every light added up (a mask), and a tinted copy.
const mapLayer = document.createElement('canvas');
const mapCtx = mapLayer.getContext('2d')!;
const groupLayer = document.createElement('canvas');
const groupCtx = groupLayer.getContext('2d')!;
const maskLayer = document.createElement('canvas');
const maskCtx = maskLayer.getContext('2d')!;
const tintLayer = document.createElement('canvas');
const tintCtx = tintLayer.getContext('2d')!;

// Each light's reach, faded by its falloff, all added into maskLayer (white, alpha = brightness).
const drawLightMask = (groups: LightGroup[]) => {
  maskCtx.clearRect(0, 0, maskLayer.width, maskLayer.height);
  for (const g of groups) {
    groupCtx.setTransform(1, 0, 0, 1, 0, 0);
    groupCtx.clearRect(0, 0, groupLayer.width, groupLayer.height);
    groupCtx.setTransform(ed.k, 0, 0, ed.k, 0, 0);
    groupCtx.fillStyle = '#fff';
    polygonsPath(groupCtx, g.polys);
    groupCtx.fill();
    groupCtx.globalCompositeOperation = 'destination-in';
    const falloff = groupCtx.createRadialGradient(g.origin.x, g.origin.y, 0, g.origin.x, g.origin.y, g.radius);
    for (const [t, v] of LIGHT.falloffStops) falloff.addColorStop(t, `rgba(255,255,255,${v})`);
    groupCtx.fillStyle = falloff;
    groupCtx.fillRect(0, 0, groupLayer.width / ed.k, groupLayer.height / ed.k);
    groupCtx.globalCompositeOperation = 'source-over';
    maskCtx.globalCompositeOperation = 'lighter';
    maskCtx.drawImage(groupLayer, 0, 0);
  }
  maskCtx.globalCompositeOperation = 'source-over';
};

// `color` (or the map itself, when null) wherever there's light, at the light's strength.
const tinted = (color: string | null) => {
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.clearRect(0, 0, tintLayer.width, tintLayer.height);
  if (color) {
    tintCtx.fillStyle = color;
    tintCtx.fillRect(0, 0, tintLayer.width, tintLayer.height);
  } else tintCtx.drawImage(mapLayer, 0, 0);
  tintCtx.globalCompositeOperation = 'destination-in';
  tintCtx.drawImage(maskLayer, 0, 0);
  tintCtx.globalCompositeOperation = 'source-over';
  return tintLayer;
};

export const draw = () => {
  const g = ed.doc.grid;
  const w = g[0].length * ed.cs;
  const h = g.length * ed.cs;
  for (const c of [canvas, mapLayer, groupLayer, maskLayer, tintLayer])
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      ed.lightDirty = true;
    }
  g.forEach((row, y) => row.forEach((cell, x) => drawCell(mapCtx, x, y, cell)));
  drawDoors(mapCtx);

  if (ed.view === 'plain' || !ed.traced) ctx.drawImage(mapLayer, 0, 0);
  else {
    if (ed.lightDirty) {
      drawLightMask(ed.traced.groups);
      ed.lightDirty = false;
    }
    if (ed.view === 'fog') {
      // The map dimmed and grayed like fog memory, with lit areas showing through at full colour.
      ctx.filter = 'grayscale(1) brightness(0.45)';
      ctx.drawImage(mapLayer, 0, 0);
      ctx.filter = 'none';
      ctx.drawImage(tinted(null), 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(tinted('rgb(255, 220, 150)'), 0, 0);
    } else {
      ctx.drawImage(mapLayer, 0, 0);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(tinted('rgb(90, 200, 255)'), 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawOverlays(w, h);
};
