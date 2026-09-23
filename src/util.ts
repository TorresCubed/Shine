export const normalizeAngle = (angle: number): number  => {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

export const polygonPath = (targetCtx: CanvasRenderingContext2D, points: { x: number; y: number }[]) => {
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (const p of points) targetCtx.lineTo(p.x, p.y);
  targetCtx.closePath();
}

// Same as polygonPath, but several polygons as subpaths of one path, so they fill in a single call.
export const polygonsPath = (targetCtx: CanvasRenderingContext2D, polygons: { x: number; y: number }[][]) => {
  targetCtx.beginPath();
  for (const points of polygons) {
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) targetCtx.lineTo(points[i].x, points[i].y);
    targetCtx.closePath();
  }
}

export const reflectPointAcrossLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: p.x, y: p.y };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}


