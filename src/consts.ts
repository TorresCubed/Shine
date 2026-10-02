export const GRID_SIZE = 64;
export const TARGET_FPS = 60;
const PX_PER_FOOT = GRID_SIZE / 3;
const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT);

export const PLAYER = {
  speed: 8 / 3 * GRID_SIZE,
  collisionRadius: 0.16 * GRID_SIZE,
  cornerAssist: 0.35 * GRID_SIZE,
  slideStepDeg: 10,
  slideMaxDeg: 80,
  walkFacingTolDeg: 30,
  turnDegPerS: 1080,
  fearReach: 0.05 * GRID_SIZE,
  pickupRadius: 0.5 * GRID_SIZE, // also min gap when dropping
  // turning the flashlight
  aim: {
    minDegPerS: 24,
    maxDegPerS: 320,
    rampMs: 500,
  },
};

// `anchor`: pivot pixel; default image centre
export type ObjectSprite = { file: string; anchor?: { x: number; y: number } };
export const SPRITES = {
  playerScale: 1.2,
  player: {
    flashlight: { file: 'sprite/spriteFlashlight.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 53, y: 38 }, lensHalfHeight: 3 },
    candle: { file: 'sprite/spriteCandle.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 47.5, y: 36.5 } },
    empty: { file: 'sprite/sprite.png', anchor: { x: 33.5, y: 32.5 } },
  },
  objects: {
    mirror: { file: 'interactive/mirror.png' },
    flashlight: { file: 'interactive/droppedFlashlight.png' },
    candle: { file: 'interactive/droppedCandle.png' },
    stairs: { file: 'levelPieces/Stairs.png' },
    stairsExit: { file: 'levelPieces/StairsExit.png' },
    plateDead: { file: 'plates/plateDead.png' },
    lever: { file: 'interactive/lever.png' },
    leverOff: { file: 'interactive/leverOff.png' },
    leverMid: { file: 'interactive/leverMid.png' },
    wheel: { file: 'interactive/wheel.png' },
    door: { file: 'levelPieces/door.png', anchor: { x: 31, y: 0 } },
    plateActiveStd: { file: 'plates/plateActiveStd.png' },
    plateActiveLock: { file: 'plates/plateActiveLock.png' },
  } satisfies Record<string, ObjectSprite>,
};

export const ANIMATION = {
  leverFlickMs: 100,
};

// shared by gameplay and drawing
export const LIGHT = {
  falloffStops: [[0, 1], [0.4, 0.9], [1, 0]] as [number, number][], // [t, brightness], interpolated
  litThreshold: 0.15,
  edgeGap: 0.04 * GRID_SIZE,
  maxMirrorBounces: 3,
  igniteMs: 2000, // grow in at level start
};

// candles and lamps
export const FLAME = {
  candleRadius: CANDLE_RADIUS,
  lampRadius: CANDLE_RADIUS + GRID_SIZE,
  rayCount: 120,
  flickerReach: 0.1, // drawn only
  flickerBrightness: 0.27, // drawn only
};

export const FLASHLIGHT = {
  range: Math.round(45 * PX_PER_FOOT),
  cone: 20 * Math.PI / 180,
  beamCore: 0.6,
  back: 0.28,
  rayCount: 24,
  spill: {
    cone: 26 * Math.PI / 180,
    strength: 0.1,
    range: 0.7,
    rayCount: 16,
  },
};

// tracing quality and soft shadows
export const RAYS = {
  refineDepth: 5, // bisections where neighbours differ
  maxTraced: 2048,
  softShadowSize: 0.4 * GRID_SIZE,
  softShadowMax: 20 * Math.PI / 180,
  softShadowSteps: 8,
  edgeMinJump: 0.2 * GRID_SIZE,
};

// how lit art is drawn
export const LIT_SURFACES = {
  floorStrength: 0.8,
  floorTint: 'rgb(255, 228, 190)', // multiplied, keeps contrast
  wallPenetration: 0.08 * GRID_SIZE,
};

export const FOG = {
  memoryScale: 0.25, // lower = softer edges
  floorBrightness: 0.45, // remembered art vs. lit
  visibility: 0, // 0 = fog floor off
  falloffShoulder: 3, // (1 - t^k)^2 exponent
  fadeS: 5,
  fadeMin: 0, // above 0, never fully dark
};

// floating motes, drawn only
export const DUST = {
  perCell: 1,
  speed: 0.12 * GRID_SIZE, // px/s, ± half
  size: 2,
  brightness: 0.45,
  twinkleMs: 2200,
};

export const MIRROR = {
  halfLength: 0.35 * GRID_SIZE,
  pivotRadius: 0.1 * GRID_SIZE, // only the pivot blocks
  steps: 8, // per half-turn
  stepMs: 750,
  reach: 1.25 * GRID_SIZE,
  reachFacingDeg: 50,
};

export const DOOR = {
  openMs: 1000,
  creak: 0.2, // ajar share while lit
  creakMs: 700,
  slamMs: 120,
  thickness: 4, // for collision
  artWidth: 6, // door.png's width
};

export const PLATE = {
  wakeMs: 750,
  // going dark: shift, flare, fade
  wink: {
    shiftMs: 720,
    flareMs: 550,
    fadeMs: 450,
    flare: 0.6,
  },
};

export const INPUT = {
  tapReach: 1.5 * GRID_SIZE, // no wall in between
  tapPlayerRadius: 0.4 * GRID_SIZE, // tap self: pickup/drop
  tapSlop: 12, // CSS px
  // on-screen touch stick
  stick: {
    radius: 56, // CSS px
    deadZone: 0.15,
    walk: 0.45, // below this, only turn
    snapDeg: 12,
  },
};

export const CAMERA = {
  maxZoom: 3, // screen px per art px
  zoomEaseMs: 750,
  panReturn: 3, // per second, exponential
  pinchFitSnap: 0.2,
  // overview, then glide in
  start: {
    overviewMs: 1500,
    viewCells: 6,
    zoomMs: 2200,
  },
};

export const TRANSITION = {
  winDim: 0.8,
  winFadeMs: 900,
  cardFadeMs: 500,
  levelFadeOutMs: 400,
  levelFadeInMs: 800,
  restartFadeMs: 200,
};
