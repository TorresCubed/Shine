const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Persistent canvas: accumulates every area ever lit, never cleared
const exploredCanvas = document.createElement('canvas');
const exploredCtx = exploredCanvas.getContext('2d')!;

const reflectionCanvas = document.createElement('canvas');
const reflectionCtx = reflectionCanvas.getContext('2d')!;

// Reused scratch canvas for the dim "remembered" layer
const dimLayer = document.createElement('canvas');
const dimCtx = dimLayer.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  exploredCanvas.width = window.innerWidth;
  exploredCanvas.height = window.innerHeight;
  dimLayer.width = window.innerWidth;
  dimLayer.height = window.innerHeight;
  reflectionCanvas.width = window.innerWidth;
  reflectionCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();


function updateVisual() {
  const targetX = player.gridX * TILE_SIZE + TILE_SIZE / 2;
  const targetY = player.gridY * TILE_SIZE + TILE_SIZE / 2;
  player.visualX += (targetX - player.visualX) * (MOVE_SPEED / 60);
  player.visualY += (targetY - player.visualY) * (MOVE_SPEED / 60);
}

interface Mirror { x1: number; y1: number; x2: number; y2: number; }

const mirrors: Mirror[] = [
  { x1: 500, y1: 500, x2: 560, y2: 460 },
];

function reflectVector(d: { x: number; y: number }, n: { x: number; y: number }) {
  const dot = d.x * n.x + d.y * n.y;
  return { x: d.x - 2 * dot * n.x, y: d.y - 2 * dot * n.y };
}

function getMirrorNormal(m: Mirror, incoming: { x: number; y: number }) {
  const dx = m.x2 - m.x1;
  const dy = m.y2 - m.y1;
  const len = Math.hypot(dx, dy);
  let nx = -dy / len;
  let ny = dx / len;
  // Flip the normal so it always faces back toward the incoming ray
  if (nx * incoming.x + ny * incoming.y > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

const keysDown = new Set<string>();
let lastMoveTime = 0;
const MOVE_COOLDOWN = 150; // ms between grid steps, prevents instant multi-tile jumps

window.addEventListener('keydown', (e) => keysDown.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));


function pointSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function isWalkable(gx: number, gy: number): boolean {
  const px = gx * TILE_SIZE + TILE_SIZE / 2;
  const py = gy * TILE_SIZE + TILE_SIZE / 2;
  for (const w of walls) {
    if (px > w.x && px < w.x + w.w && py > w.y && py < w.y + w.h) return false;
  }
  for (const m of mirrors) {
    if (pointSegmentDistance(px, py, m.x1, m.y1, m.x2, m.y2) < TILE_SIZE / 2) return false;
  }
  return true;
}

function tryMove(now: number) {
  if (now - lastMoveTime < MOVE_COOLDOWN) return;

  let dx = 0, dy = 0;
  if (keysDown.has('w') || keysDown.has('arrowup')) dy = -1;
  else if (keysDown.has('s') || keysDown.has('arrowdown')) dy = 1;
  else if (keysDown.has('a') || keysDown.has('arrowleft')) dx = -1;
  else if (keysDown.has('d') || keysDown.has('arrowright')) dx = 1;

  if (dx === 0 && dy === 0) return;

  const newX = player.gridX + dx;
  const newY = player.gridY + dy;

  if (isWalkable(newX, newY)) {
    player.gridX = newX;
    player.gridY = newY;
    lastMoveTime = now;
  }
}
function reflectPointAcrossLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: p.x, y: p.y };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}
const LIGHT_RADIUS = 250;
const TILE_SIZE = 50; // matches your floor's GRID_SIZE

const player = {
  gridX: 8,   // logical grid position (integer cells)
  gridY: 7,
  visualX: 0, // pixel position, smoothly follows gridX/gridY
  visualY: 0,
};
player.visualX = player.gridX * TILE_SIZE + TILE_SIZE / 2;
player.visualY = player.gridY * TILE_SIZE + TILE_SIZE / 2;

const MOVE_SPEED = 8; // higher = snappier interpolation, lower = more floaty
const walls = [
  { x: 400, y: 300, w: 150, h: 40 },
  { x: 200, y: 450, w: 40, h: 200 },
  { x: 600, y: 150, w: 40, h: 300 },
];

function getWallCorners(w: typeof walls[0]) {
  return [
    { x: w.x, y: w.y },
    { x: w.x + w.w, y: w.y },
    { x: w.x + w.w, y: w.y + w.h },
    { x: w.x, y: w.y + w.h },
  ];
}

interface Segment { x1: number; y1: number; x2: number; y2: number; }

function wallToSegments(w: typeof walls[0]): Segment[] {
  const c = getWallCorners(w);
  return [0, 1, 2, 3].map(i => ({ x1: c[i].x, y1: c[i].y, x2: c[(i + 1) % 4].x, y2: c[(i + 1) % 4].y }));
}

function getBlockingSegments(wallsList: typeof walls, mirrorsList: Mirror[]): Segment[] {
  const segs: Segment[] = [];
  for (const w of wallsList) segs.push(...wallToSegments(w));
  for (const m of mirrorsList) segs.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 });
  return segs;
}

function castRayBlocking(origin: { x: number; y: number }, angle: number, segments: Segment[], maxDistance: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const farX = origin.x + dx * maxDistance, farY = origin.y + dy * maxDistance;
  let closest = { x: farX, y: farY };
  let closestDist = maxDistance;
  for (const s of segments) {
    const hit = lineIntersect(origin.x, origin.y, farX, farY, s.x1, s.y1, s.x2, s.y2);
    if (hit) {
      const dist = Math.hypot(hit.x - origin.x, hit.y - origin.y);
      if (dist < closestDist) { closestDist = dist; closest = hit; }
    }
  }
  return closest;
}

function lineIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  const EPS = 1e-6;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

function castRay(
  origin: { x: number; y: number },
  angle: number,
  wallsList: typeof walls,
  mirrorsList: Mirror[],
  maxDistance: number,
  bounces: number = 3
): { x: number; y: number } {
  let currentOrigin = origin;
  let currentAngle = angle;
  let remainingDistance = maxDistance;

  for (let bounce = 0; bounce <= bounces; bounce++) {
    const dx = Math.cos(currentAngle);
    const dy = Math.sin(currentAngle);
    const farX = currentOrigin.x + dx * remainingDistance;
    const farY = currentOrigin.y + dy * remainingDistance;

    let closest = { x: farX, y: farY };
    let closestDist = remainingDistance;
    let hitMirror: Mirror | null = null;

    for (const w of wallsList) {
      const corners = getWallCorners(w);
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const hit = lineIntersect(currentOrigin.x, currentOrigin.y, farX, farY, a.x, a.y, b.x, b.y);
        if (hit) {
          const dist = Math.hypot(hit.x - currentOrigin.x, hit.y - currentOrigin.y);
          if (dist < closestDist) {
            closestDist = dist;
            closest = hit;
            hitMirror = null;
          }
        }
      }
    }

    for (const m of mirrorsList) {
      const hit = lineIntersect(currentOrigin.x, currentOrigin.y, farX, farY, m.x1, m.y1, m.x2, m.y2);
      if (hit) {
        const dist = Math.hypot(hit.x - currentOrigin.x, hit.y - currentOrigin.y);
        if (dist < closestDist) {
          closestDist = dist;
          closest = hit;
          hitMirror = m;
        }
      }
    }

    if (!hitMirror) return closest;

    const normal = getMirrorNormal(hitMirror, { x: dx, y: dy });
    const reflected = reflectVector({ x: dx, y: dy }, normal);
    currentAngle = Math.atan2(reflected.y, reflected.x);
    remainingDistance -= closestDist;
    // Nudge off the mirror surface slightly so the next iteration doesn't immediately re-hit it
    currentOrigin = { x: closest.x + reflected.x * 0.01, y: closest.y + reflected.y * 0.01 };
  }

  const dx = Math.cos(currentAngle);
  const dy = Math.sin(currentAngle);
  return { x: currentOrigin.x + dx * remainingDistance, y: currentOrigin.y + dy * remainingDistance };
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function computeVisibilityPolygon(light: { x: number; y: number }, segments: Segment[], maxDistance: number) {
  const angles: number[] = [];
  for (const s of segments) {
    for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
      const angle = Math.atan2(pt.y - light.y, pt.x - light.x);
      angles.push(normalizeAngle(angle - 0.001), normalizeAngle(angle), normalizeAngle(angle + 0.001));
    }
  }
  const SWEEP_STEPS = 180;
  for (let i = 0; i < SWEEP_STEPS; i++) angles.push(normalizeAngle((i / SWEEP_STEPS) * Math.PI * 2));
  angles.sort((a, b) => a - b);
  return angles.map(angle => castRayBlocking(light, angle, segments, maxDistance));
}


function computeMirrorPolygon(
  light: { x: number; y: number },
  mirror: Mirror,
  allSegments: Segment[],
  maxDistance: number
): { x: number; y: number }[] | null {
  const m1 = { x: mirror.x1, y: mirror.y1 };
  const m2 = { x: mirror.x2, y: mirror.y2 };
  const virtualLight = reflectPointAcrossLine(light, m1, m2);

  // Decide corner order by which side of the mirror the real light sits on —
  // stable frame-to-frame, unlike picking the "shorter arc" which flips near 180°
  const mdx = m2.x - m1.x, mdy = m2.y - m1.y;
  const toLightX = light.x - m1.x, toLightY = light.y - m1.y;
  const cross = mdx * toLightY - mdy * toLightX;

const startCorner = cross < 0 ? m1 : m2;
const endCorner = cross < 0 ? m2 : m1;

  const startAngle = normalizeAngle(Math.atan2(startCorner.y - virtualLight.y, startCorner.x - virtualLight.x));
  const endAngle = normalizeAngle(Math.atan2(endCorner.y - virtualLight.y, endCorner.x - virtualLight.x));
  const diff = normalizeAngle(endAngle - startAngle);
if (diff < 1e-6 || diff > Math.PI + 1e-6) return null; // degenerate, or light beyond mirror's edge-on plane

  const otherSegments = allSegments.filter(s =>
    !(s.x1 === mirror.x1 && s.y1 === mirror.y1 && s.x2 === mirror.x2 && s.y2 === mirror.y2)
  );

  const angles: number[] = [];
const SWEEP_STEPS = 48;
for (let i = 0; i <= SWEEP_STEPS; i++) {
  // Keep these as raw offsets from startAngle — do NOT normalize yet
  angles.push(diff * (i / SWEEP_STEPS));
}

  // Sharp shadow edges for anything the reflected view hits
 for (const s of otherSegments) {
  for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
    const ang = normalizeAngle(Math.atan2(pt.y - virtualLight.y, pt.x - virtualLight.x));
    for (const candidate of [ang - 0.001, ang, ang + 0.001]) {
      const rel = normalizeAngle(candidate - startAngle);
      if (rel <= diff) {
        angles.push(rel);
      }
    }
  }
}

  angles.sort((a, b) => a - b);
const farPoints = angles.map(offset => castRayBlocking(virtualLight, normalizeAngle(startAngle + offset), otherSegments, maxDistance));
  return [startCorner, ...farPoints, endCorner];
}

const GRID_SIZE = 50;

function drawFloor(targetCtx: CanvasRenderingContext2D) {
  for (let x = 0; x < canvas.width; x += GRID_SIZE) {
    for (let y = 0; y < canvas.height; y += GRID_SIZE) {
      const isEven = ((x / GRID_SIZE) + (y / GRID_SIZE)) % 2 === 0;
      targetCtx.fillStyle = isEven ? 'red' : 'blue';
      targetCtx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
    }
  }
}

function polygonPath(targetCtx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  targetCtx.beginPath();
  targetCtx.moveTo(points[0].x, points[0].y);
  for (const p of points) targetCtx.lineTo(p.x, p.y);
  targetCtx.closePath();
}

function draw(now: number = 0) {
  tryMove(now);
  updateVisual();

  const light = { x: player.visualX, y: player.visualY }
  const segments = getBlockingSegments(walls, mirrors);
  const points = computeVisibilityPolygon(light, segments, LIGHT_RADIUS);

  // 1. Permanently record this frame's visible area into the "explored" canvas
  exploredCtx.fillStyle = 'white';
  polygonPath(exploredCtx, points);
  exploredCtx.fill();

  // 2. Base darkness
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Dim "remembered" layer: floor, desaturated, masked to everything ever explored
  dimCtx.clearRect(0, 0, canvas.width, canvas.height);
  dimCtx.filter = 'grayscale(1) brightness(0.6)';
  drawFloor(dimCtx);
  dimCtx.filter = 'none'; // reset so it doesn't affect anything else drawn to this context later

  dimCtx.globalCompositeOperation = 'destination-in';
  dimCtx.drawImage(exploredCanvas, 0, 0);
  dimCtx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = 1; // no longer need the opacity trick, grayscale+brightness does the dimming now
  ctx.drawImage(dimLayer, 0, 0);

  // 4. Bright "currently lit" layer: floor, with radial falloff, clipped to the live visibility polygon
  ctx.save();
  polygonPath(ctx, points);
  ctx.clip();

  // Draw the floor into a scratch buffer
  dimCtx.clearRect(0, 0, canvas.width, canvas.height); // reusing dimLayer as scratch here
  drawFloor(dimCtx);

  // Multiply it by a radial brightness falloff — this is what actually creates the fade
  dimCtx.globalCompositeOperation = 'destination-in';
  const falloff = dimCtx.createRadialGradient(light.x, light.y, 0, light.x, light.y, LIGHT_RADIUS);
  falloff.addColorStop(0, 'rgba(255,255,255,1)');
  falloff.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  falloff.addColorStop(1, 'rgba(255,255,255,0)');
  dimCtx.fillStyle = falloff;
  dimCtx.fillRect(0, 0, canvas.width, canvas.height);
  dimCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(dimLayer, 0, 0);
  
  
  dimCtx.clearRect(0, 0, canvas.width, canvas.height);
dimCtx.fillStyle = 'white';
dimCtx.beginPath();

exploredCtx.fillStyle = 'white';
exploredCtx.beginPath();

// Replace the combined mirror-mask block with a per-mirror pass
for (const m of mirrors) {
  const poly = computeMirrorPolygon(light, m, segments, LIGHT_RADIUS);
  if (!poly || poly.length < 3) continue;

  const virtualLight = reflectPointAcrossLine(light, { x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });

  // Build this mirror's lit floor: draw floor, clip to its polygon, multiply by falloff from virtualLight
  dimCtx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor(dimCtx);

  dimCtx.globalCompositeOperation = 'destination-in';
  polygonPath(dimCtx, poly);
  dimCtx.fill();
  dimCtx.globalCompositeOperation = 'source-over';

  dimCtx.globalCompositeOperation = 'destination-in';
  const mirrorFalloff = dimCtx.createRadialGradient(virtualLight.x, virtualLight.y, 0, virtualLight.x, virtualLight.y, LIGHT_RADIUS);
  mirrorFalloff.addColorStop(0, 'rgba(255,255,255,1)');
  mirrorFalloff.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  mirrorFalloff.addColorStop(1, 'rgba(255,255,255,0)');
  dimCtx.fillStyle = mirrorFalloff;
  dimCtx.fillRect(0, 0, canvas.width, canvas.height);
  dimCtx.globalCompositeOperation = 'source-over';

  // Tint pass for this mirror only
  reflectionCtx.clearRect(0, 0, canvas.width, canvas.height);
  reflectionCtx.fillStyle = 'rgba(140, 200, 255, 0.15)';
  reflectionCtx.fillRect(0, 0, canvas.width, canvas.height);
  reflectionCtx.globalCompositeOperation = 'destination-in';
  reflectionCtx.drawImage(dimLayer, 0, 0);
  reflectionCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(dimLayer, 0, 0);       // faded floor for this mirror's reflection
  ctx.drawImage(reflectionCanvas, 0, 0); // tinted overlay for this mirror's reflection

  // Keep exploredCtx as a flat mask — "ever seen" memory doesn't need falloff
  exploredCtx.fillStyle = 'white';
  polygonPath(exploredCtx, poly);
  exploredCtx.fill();
}

  reflectionCtx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor(reflectionCtx);
  reflectionCtx.fillStyle = 'rgba(140, 200, 255, 0.15)';
  reflectionCtx.fillRect(0, 0, canvas.width, canvas.height);
  reflectionCtx.globalCompositeOperation = 'destination-in';
  reflectionCtx.drawImage(dimLayer, 0, 0);
  reflectionCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(reflectionCanvas, 0, 0);

  // Warm color glow on top, same falloff shape, purely for tint
  const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, LIGHT_RADIUS);
  gradient.addColorStop(0, 'rgba(255, 220, 150, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
    
  ctx.fillStyle = 'orange';
  ctx.beginPath();
  ctx.arc(player.visualX, player.visualY, 8, 0, Math.PI * 2);
  ctx.fill();

  // 5. Walls, drawn on top, always visible if within explored or lit area
  ctx.fillStyle = '#111';
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);

  //6. Mirrors
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 4;
  for (const m of mirrors) {
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
  }
  requestAnimationFrame(draw);
}

draw();