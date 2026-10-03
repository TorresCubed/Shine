import { canvas, ctx, pixelRatio } from './canvases';
import { viewMode } from './frame';

// ?perf: CPU time per part of a frame, averaged over PERF_FRAMES, shown under the fps. The GPU can't be
// timed from here (reading pixels back moves Chrome's canvas off the GPU), so ?skip=a,b turns parts
// off to compare fps instead: fog, memory, lit, floor, faces, soft, sight, objects, screen.
const params = new URLSearchParams(location.search);
const perfParam = params.get('perf');
export const skip = new Set((params.get('skip') ?? '').split(',').filter(Boolean));
const PERF_FRAMES = 60;
const perfTotals = new Map<string, number>();
let perfAt = 0;
let perfFrames = 0;
let perfText = '';
export const perfMark = (name: string) => {
  if (perfParam === null) return;
  const t = performance.now();
  perfTotals.set(name, (perfTotals.get(name) ?? 0) + t - perfAt);
  perfAt = t;
};
export const perfFrameStart = () => {
  if (perfParam === null) return;
  perfAt = performance.now();
};
export const perfFrameEnd = () => {
  if (perfParam === null || ++perfFrames < PERF_FRAMES) return;
  let total = 0;
  const parts = [...perfTotals].map(([name, ms]) => {
    total += ms;
    return `${name} ${(ms / perfFrames).toFixed(1)}`;
  });
  perfText = `${(total / perfFrames).toFixed(1)} ms/frame: ${parts.join(' · ')}`;
  document.body.dataset.perf = perfText;
  perfTotals.clear();
  perfFrames = 0;
};

// Frames drawn per second, counted over each second.
let fpsWindowStart = 0;
let fpsFrames = 0;
let fps = 0;
export const countFrame = (now: number) => {
  fpsFrames++;
  if (now - fpsWindowStart >= 1000) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsWindowStart));
    fpsFrames = 0;
    fpsWindowStart = now;
  }
};

// The fps line (and, with ?perf, the timings) over the screen: only with ?fps or ?perf, or in the
// editor's playtest.
const showHud = params.has('fps') || perfParam !== null || params.has('playtest');
export const drawHud = (rayCount: number, lightCount: number, groupCount: number) => {
  if (!showHud) return;
  ctx.fillStyle = '#0f0';
  ctx.font = '12px monospace';
  ctx.fillText(`${fps} fps · ${rayCount} rays · ${lightCount} lights · ${groupCount} light groups`, 8, 16);
  if (perfText) {
    // Wrapped to the screen's width, so it all shows on a phone.
    const maxW = canvas.width / pixelRatio - 16;
    let y = viewMode !== 'normal' ? 48 : 32;
    let line = '';
    for (const part of perfText.split(' · ')) {
      const next = line ? `${line} · ${part}` : part;
      if (line && ctx.measureText(next).width > maxW) {
        ctx.fillText(line, 8, y);
        y += 16;
        line = part;
      } else line = next;
    }
    ctx.fillText(line, 8, y);
  }
  if (viewMode !== 'normal') ctx.fillText(`playtest · ${viewMode} view (V to switch) · R restarts`, 8, 32);
};
