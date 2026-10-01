// Tuning values. Runtime state lives in state.ts.

// Everything else is sized from this, so changing it scales the whole game without changing how any
// level plays. 64px suits common tile art sizes (16/32/64).
export const GRID_SIZE = 64;
export const PLAYER_SPEED = 8 / 3 * GRID_SIZE;      // px per second
export const PLAYER_HALF_SIZE = 0.16 * GRID_SIZE;   // collision footprint (drawn bigger)
// Player sprites (in src/assets), one per light in hand and one empty-handed, drawn facing right and
// rotated to face the aim. `anchor` is the pixel that sits on the player's position (the centre of the head); `light` is
// where the held light shines from: the flame, or the front centre of the flashlight's lens, which
// the beam fills (`lensHalfHeight`).
export const PLAYER_SPRITE_SCALE = 1.2;
export const PLAYER_SPRITES = {
  flashlight: { file: 'spriteFlashlight.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 53, y: 38 }, lensHalfHeight: 3 },
  candle: { file: 'spriteCandle.png', anchor: { x: 33.5, y: 32.5 }, light: { x: 47.5, y: 36.5 } },
  empty: { file: 'sprite.png', anchor: { x: 33.5, y: 32.5 } },
};
// Object art (in src/assets), each with the pixel that sits on the object's centre (and turns with
// it). The mirror is drawn upright ('|'), its reflecting face on the anchor's column; the flashlight
// points right, lens-first, with the anchor on the line through its lens.
export const OBJECT_SPRITES = {
  mirror: { file: 'mirror.png', anchor: { x: 33.5, y: 31.5 } },
  flashlight: { file: 'droppedFlashlight.png', anchor: { x: 32, y: 29.5 } },
  candle: { file: 'droppedCandle.png', anchor: { x: 31.5, y: 31.5 } },
  // Stairs fill their cell: the way in at the start, and the way on at the exit.
  stairs: { file: 'Stairs.png', anchor: { x: 32, y: 32 } },
  stairsExit: { file: 'StairsExit.png', anchor: { x: 32, y: 32 } },
  // Plates fill their cell: dead while dark, waking to their door's kind of active while lit.
  plateDead: { file: 'plateDead.png', anchor: { x: 32, y: 32 } },
  // A lever on, off, and mid-flick between. A lever that turns mirrors is a wheel instead, turning
  // with them, about its hub.
  lever: { file: 'lever.png', anchor: { x: 32, y: 30 } },
  leverOff: { file: 'leverOff.png', anchor: { x: 32, y: 30 } },
  leverMid: { file: 'leverMid.png', anchor: { x: 32, y: 30 } },
  wheel: { file: 'wheel.png', anchor: { x: 32.5, y: 28.5 } },
  // A door's leaf (every kind): upright, the hinge at the top, the leaf's centre line on the anchor's column.
  door: { file: 'door.png', anchor: { x: 31, y: 0 } },
  plateActiveStd: { file: 'plateActiveStd.png', anchor: { x: 32, y: 32 } },
  plateActiveLock: { file: 'plateActiveLock.png', anchor: { x: 32, y: 32 } },
};
// Standing still, the player sprite idles: 'breathe' swells and shrinks it slightly (reads as
// breathing, seen from above), 'bob' moves it up and down the screen. Only the drawing moves.
// Off for now: both look off on pixel art; hand-drawn idle frames will replace them.
export const IDLE_STYLE = 'off' as 'off' | 'breathe' | 'bob';
export const IDLE_BREATHE = 0.03;            // how much it swells, as a fraction of its size
export const IDLE_BOB = 0.03 * GRID_SIZE;    // how far it bobs
export const IDLE_PERIOD_MS = 2600;          // one breath (or bob)
export const IDLE_FADE_MS = 300;             // how long it takes to settle into (or out of) idling
// A scale punch on interactions (picking up, dropping or swapping a light, pulling a lever): the thing
// pops up by PUNCH_SCALE and settles back over PUNCH_MS. Only the drawing.
export const PUNCH_SCALE = 0.07;
export const PUNCH_MS = 180;
export const LEVER_FLICK_MS = 100; // a pulled lever shows mid-flick this long before it lands the other way
// Stopped dead walking into the dark (or anything else you can't slide along axis by axis), you
// slide off to whichever side is clear, trying turns of SLIDE_STEP_DEG up to SLIDE_MAX_DEG from the
// way you're pushing. Nearer 90 slides along edges you meet almost square on, but more slowly.
export const SLIDE_STEP_DEG = 10;
export const SLIDE_MAX_DEG = 80;
export const CORNER_ASSIST =0.35 * GRID_SIZE;   // how far you're nudged sideways to line up with a gap
// You count as lit if any point this close to your centre is: a hair of grace, so the edge of the
// light is where you stop.
export const FEAR_REACH = 0.05 * GRID_SIZE;

// 1 grid cell = 3ft.
const PX_PER_FOOT = GRID_SIZE / 3;
export const CANDLE_RADIUS = Math.round(10 * PX_PER_FOOT);
export const LAMP_RADIUS = CANDLE_RADIUS + GRID_SIZE;
export const LIGHT_EDGE_GAP = 0.04 * GRID_SIZE; // wall lamps shine from this far off the wall face, so rays never start on it
export const FLASHLIGHT_BACK = 0.28; // a dropped flashlight shines from its handle end, this far (in cells) behind centre
export const FLASHLIGHT_RANGE = Math.round(45 * PX_PER_FOOT);
// A flashlight's beam isn't quite a hard-edged wedge: it's full strength across its core, the middle
// FLASHLIGHT_CORE of its width, then fades smoothly to nothing at the edge of FLASHLIGHT_CONE (total
// width). Light and gameplay alike.
export const FLASHLIGHT_CONE = 20 * Math.PI / 180;
export const FLASHLIGHT_CORE = 0.6; // so the fade is its last 4° each side
// Spill: light leaking past the reflector, a slightly wider, dim cone around the beam (with its own
// shadows). It fades from where the beam ends out to its own edge, so the beam fades on into it. Kept under LIT_THRESHOLD, so on its own it never
// lights a plate or lets you walk: it only lets you make out a little around the beam.
export const FLASHLIGHT_SPILL_CONE = 26 * Math.PI / 180;
export const FLASHLIGHT_SPILL_STRENGTH = 0.1;
export const FLASHLIGHT_SPILL_RANGE = 0.7; // of FLASHLIGHT_RANGE
// Light off a mirror fades the same way as the beam toward the edges of what the mirror catches: full
// across the middle MIRROR_EDGE_CORE of it (as seen from the reflection's virtual source).
export const MIRROR_EDGE_CORE = FLASHLIGHT_CORE;
// Soft shadows (only drawn): past a corner, a shadow's edge fades over the angle a light this size
// makes from the corner (at most SHADOW_SOFT_MAX), drawn as SHADOW_SOFT_STEPS slices. Bigger is softer.
// Only a jump of SHADOW_EDGE_MIN_JUMP or more between neighbouring rays counts as a shadow's edge.
export const SHADOW_SOFT_SIZE = 0.4 * GRID_SIZE;
export const SHADOW_SOFT_MAX = 20 * Math.PI / 180;
export const SHADOW_SOFT_STEPS = 8;
export const SHADOW_EDGE_MIN_JUMP = 0.2 * GRID_SIZE;
// While walking, the flashlight swings round to face where you're going at this rate.
export const FACING_TURN_DEG_PER_S = 1080;
// You only start walking once facing within this of the way you want to go. Not 0, so easing from
// straight to diagonal mid-walk barely hitches.
export const WALK_FACING_TOLERANCE_DEG = 30;
// Standing still, Q/E aim it instead: slow at first for fine adjustment, ramping up while held.
export const FLASHLIGHT_TURN_MIN_DEG_PER_S = 24;
export const FLASHLIGHT_TURN_DEG_PER_S = 320;
export const FLASHLIGHT_TURN_RAMP_MS = 500;
export const LIGHT_IGNITE_MS = 2000; // lights grow to full radius over this long at level start
// Flames (candles and lamps) flicker: how much their drawn reach and brightness dip, at
// most. Only how they're drawn: plates and the fear rule see the light steady.
export const FLAME_FLICKER_REACH = 0.1;
export const FLAME_FLICKER_BRIGHTNESS = 0.27;

// Dust drifting in the air, seen only where there's light (and fading with it). Only drawn.
export const DUST_PER_CELL = 1;               // how many motes, for the level's size
export const DUST_SPEED = 0.12 * GRID_SIZE;     // px per second, give or take half
export const DUST_SIZE = 2;                     // px across
export const DUST_BRIGHTNESS = 0.45;            // at its brightest, in full light
export const DUST_TWINKLE_MS = 2200;            // each mote slowly brightens and dims over about this

// Mirrors: a thin two-sided segment across the middle of their cell, turned in fixed steps.
export const MIRROR_HALF_LENGTH = 0.35 * GRID_SIZE; // short enough to stand in its cell beside it
// You only bump into a mirror's pivot, a post this big (radius) in the middle of its cell; the rest
// of it passes over you, so you can stand beside it and walk around it.
export const MIRROR_PIVOT_RADIUS = 0.1 * GRID_SIZE;
export const MIRROR_STEPS = 8; // orientations per half-turn (a mirror looks the same turned 180°)
export const MIRROR_STEP_MS = 750; // how long a mirror takes to swing round one step
// Space turns a turnable mirror you're facing (within this angle) this close (centre to centre).
export const MIRROR_REACH = 1.25 * GRID_SIZE;
export const MIRROR_REACH_FACING_DEG = 50;
export const MAX_MIRROR_BOUNCES = 3;
// Tapping (or clicking): a mirror or lever works if your centre is this close to its cell's centre,
// with no wall or door in between, so from its cell or the next one over (diagonals too). Tapping
// within TAP_PLAYER_RADIUS of your centre picks up or drops your light instead.
export const TAP_REACH = 1.5 * GRID_SIZE;
export const TAP_PLAYER_RADIUS = 0.4 * GRID_SIZE;
// You can pick up a light on the floor (Space, or tapping yourself) from this close to where it lies,
// whichever cell it's in; and you can't drop yours this close to another.
export const PICKUP_RADIUS = 0.5 * GRID_SIZE;
// A press that moves further than this (CSS px) before it lifts isn't a tap.
export const TAP_SLOP = 12;
// The on-screen stick: a press that drags becomes a stick centred where it went down. Pushed this far
// (CSS px) it's all the way over; drag further and the stick follows your thumb.
export const STICK_RADIUS = 56;
export const STICK_DEAD_ZONE = 0.15; // pushed less than this (of STICK_RADIUS), it does nothing
// Pushed less than this, you only turn to face that way (aiming the flashlight) without walking.
// Past it, you walk at a speed that grows with the push, full speed all the way over.
export const STICK_WALK = 0.45;
// Walking, within this of straight or diagonal, the stick snaps to it, so walking along a corridor
// stays straight (and gets corner assist, like the keys do). Not when only turning to aim.
export const STICK_SNAP_DEG = 12;

// Brightness vs. fraction of a light's radius, as [t, brightness] stops, linearly interpolated.
// Shared by the renderer and game logic, so "lit" in gameplay matches what's drawn.
export const LIGHT_FALLOFF_STOPS: [number, number][] = [[0, 1], [0.4, 0.9], [1, 0]];
export const LIT_THRESHOLD = 0.15;
// How the lit floor is drawn (only drawn: gameplay uses the light itself). At full light it shows at
// LIT_FLOOR_STRENGTH of its art, warmed by multiplying by LIT_FLOOR_TINT (multiplying keeps the art's
// contrast; adding a colour, as before, lifted the darks and washed it out). Walls and doors aren't tinted.
export const LIT_FLOOR_STRENGTH = 0.8;
export const LIT_FLOOR_TINT = 'rgb(255, 228, 190)';
export const DOOR_OPEN_MS = 1000;
// A locked door creaks ajar while its plate is lit (this share of its full swing, over
// DOOR_CREAK_MS), and slams shut again (over DOOR_SLAM_MS) if the plate goes dark before it's opened.
export const DOOR_CREAK = 0.2;
export const DOOR_CREAK_MS = 700;
export const DOOR_SLAM_MS = 120;
// A plate lit fades from dead to active over this long.
export const PLATE_WAKE_MS = 750;
// Going dark it winks out: shifts to dead (still shining), flares, then fades into the dark.
export const PLATE_WINK_SHIFT_MS = 720;
export const PLATE_WINK_FLARE_MS = 550;
export const PLATE_WINK_FADE_MS = 450;
export const PLATE_WINK_FLARE = 0.6; // how bright the flare peaks (the dead art added on again at this much)
export const DOOR_THICKNESS = 4; // a door leaf, for bumping into
export const DOOR_ART_WIDTH = 6; // a door leaf, as drawn and lit: door.png's width

export const WALL_LIGHT_PENETRATION = 0.08 * GRID_SIZE; // purely visual: how far light shows into a wall face

// Fog memory is stored at this fraction of the level's resolution; lower = softer edges.
export const FOG_MEMORY_SCALE = 0.25;
export const FOG_FLOOR_BRIGHTNESS = 0.45; // the remembered art (floor, walls, objects) vs. lit, after desaturating
// How bright remembered areas are drawn, overall, vs. the lit art: 0.1 is about as dim as light too
// faint to walk in (under LIT_THRESHOLD). At FOG_FLOOR_BRIGHTNESS or above, the remembered art as is;
// 0 turns the fog floor off: the floorboards go dark, but walls, plates, levers, mirrors and doors stay remembered.
export const FOG_VISIBILITY = 0;
// Remembered things (walls, plates, levers, mirrors, doors, and the fog floor if on) fade once out of
// sight: steadily, from full to gone in MEMORY_FADE_S seconds (things only seen dimly go sooner), but
// never below MEMORY_FADE_MIN of how they looked (above 0, a place you've been never goes completely dark).
export const MEMORY_FADE_S = 5;
export const MEMORY_FADE_MIN = 0;
// Shape of the memory's fade across a light's radius: (1 - t^k)^2, higher k holds full memory further out.
export const FOG_FALLOFF_SHOULDER = 3;

// Level transitions. Reaching the exit dims the world to WIN_DIM while the Level Complete card fades
// in; Enter fades to black and the next level fades in from black (as its lights warm up). R dips to
// black and back.
export const WIN_DIM = 0.8;
export const WIN_FADE_MS = 900;
export const CARD_FADE_MS = 500;
export const LEVEL_FADE_OUT_MS = 400;
export const LEVEL_FADE_IN_MS = 800;
export const RESTART_FADE_MS = 200;

export const TARGET_FPS = 60;
export const CAMERA_MAX_ZOOM = 3; // screen px per art px; zoom in is whole steps, so pixels stay crisp
export const ZOOM_EASE_MS = 750;  // how long the camera takes to glide to a new zoom
// A new level opens zoomed to fit (an overview), then after START_OVERVIEW_MS glides in to show about
// START_VIEW_CELLS cells across the screen's shorter side.
export const START_OVERVIEW_MS = 1500;
export const START_VIEW_CELLS = 6;
export const START_ZOOM_MS = 2200; // how long that glide in takes (slower than an ordinary zoom)
// A two-finger drag moves the view off the player; walking eases it back at this rate (per second,
// exponential: 3 is mostly back within half a second).
export const CAMERA_PAN_RETURN = 3;
// Letting go of a pinch settles on the nearest whole zoom, or on fitting the level if within this
// fraction of it.
export const PINCH_FIT_SNAP = 0.2;

// Rays are spread evenly across a light's arc, then bisected up to RAY_REFINE_DEPTH times wherever
// neighbours hit different surfaces, so rays concentrate on edges.
export const CANDLE_RAY_COUNT = 120;
export const FLASHLIGHT_RAY_COUNT = 24;
export const FLASHLIGHT_SPILL_RAY_COUNT = 16;
export const RAY_REFINE_DEPTH = 5;
export const MAX_TRACED_RAYS = 2048;
