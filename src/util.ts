// Several polygons as subpaths of one path, so they fill in a single call.
export const polygonsPath = (targetCtx: CanvasRenderingContext2D, polygons: { x: number; y: number }[][]) => {
  targetCtx.beginPath();
  for (const points of polygons) {
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) targetCtx.lineTo(points[i].x, points[i].y);
    targetCtx.closePath();
  }
}
