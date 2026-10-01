// What the menus and hints say about each level: its name, its chapter, and (for a level that brings
// in something new) a hint on how to use it, for keyboard and for touch. Indexed by level number - 1,
// in step with levels.ts.

export const LEVEL_TITLES = [
  'An Empty Room', 'The Long Way Round', 'A Small Maze',
  'Light Plates', 'Letting Go', 'Locked', 'Lamplight',
  'The Flashlight', 'A Far Plate', 'One Beam, Two Jobs', 'From a Distance',
  'Two Lights, Two Doors', 'Going Back', 'The Chain', 'Everything at Once',
  'Mirrors', 'A Chain of Mirrors', 'Diagonals', 'Two to Turn', 'Two Stages',
  'Two Doors, One Beam', 'Order Matters', 'Both at Once',
  'Levers', 'The Wheel', 'One Lever, Two Jobs',
];

// Chapters, by their first and last level (numbered from 1).
export const CHAPTERS = [
  { name: 'The Dark', first: 1, last: 3 },
  { name: 'Doors', first: 4, last: 7 },
  { name: 'The Flashlight', first: 8, last: 11 },
  { name: 'Two Lights', first: 12, last: 15 },
  { name: 'Mirrors', first: 16, last: 23 },
  { name: 'Levers', first: 24, last: 26 },
];
export const chapterOf = (levelNumber: number) => CHAPTERS.find(c => levelNumber >= c.first && levelNumber <= c.last);

type Hint = { keys: string; touch: string };
export const LEVEL_HINTS: Record<number, Hint> = {
  1: { keys: 'WASD or the arrow keys to walk. Find the stairs down.', touch: 'Drag anywhere to walk. Find the stairs down.' },
  4: { keys: 'Light a plate and its door opens.', touch: 'Light a plate and its door opens.' },
  5: {
    keys: 'Space puts your candle down. It keeps shining, but without it you can only walk where it\'s lit. R restarts.',
    touch: 'Tap yourself to put your candle down. It keeps shining, but without it you can only walk where it\'s lit. ↻ restarts.',
  },
  6: { keys: 'A locked door unlocks while its plate is lit. Walk into it then and it stays open.', touch: 'A locked door unlocks while its plate is lit. Walk into it then and it stays open.' },
  7: { keys: 'Lamps light their room, and light adds up.', touch: 'Lamps light their room, and light adds up.' },
  8: {
    keys: 'Space picks up the flashlight. You hold one light and pocket the other: F swaps.',
    touch: 'Tap yourself to pick up the flashlight. You hold one light and pocket the other: ⇄ swaps.',
  },
  9: { keys: 'Standing still, Q and E aim the flashlight.', touch: 'Standing still, ⟲ and ⟳ aim the flashlight.' },
  16: { keys: 'Mirrors bounce light. Space beside a mirror turns it.', touch: 'Mirrors bounce light. Tap a mirror nearby to turn it.' },
  24: { keys: 'Stand on a lever and press Space to pull it.', touch: 'Tap a lever nearby to pull it.' },
  25: { keys: 'A wheel turns a mirror somewhere. Space on the wheel turns it.', touch: 'A wheel turns a mirror somewhere. Tap the wheel to turn it.' },
};

// The whole of the controls, for the How to Play screen.
export const CONTROLS: { keys: string; touch: string; does: string }[] = [
  { keys: 'WASD / arrows', touch: 'Drag anywhere', does: 'Walk' },
  { keys: 'Space', touch: 'Tap yourself', does: 'Put down or pick up a light' },
  { keys: 'Space', touch: 'Tap it', does: 'Turn a mirror, pull a lever or turn a wheel' },
  { keys: 'F', touch: '⇄', does: 'Swap to your pocketed light' },
  { keys: 'Q / E', touch: '⟲ ⟳', does: 'Aim the flashlight (standing still)' },
  { keys: 'Mouse wheel / + −', touch: 'Pinch', does: 'Zoom' },
  { keys: 'Right-drag', touch: 'Two-finger drag', does: 'Look around' },
  { keys: 'R', touch: '↻', does: 'Restart the level' },
  { keys: 'Esc', touch: '☰', does: 'Menu' },
];
