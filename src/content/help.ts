// `both` when keys and touch say the same.
export type Hint = { keys: string; touch: string } | { both: string };
export const LEVEL_HINTS: Record<number, Hint> = {
  1: {
    keys: 'WASD or the arrow keys to walk. Find the stairs down.',
    touch: 'Drag anywhere to walk. Find the stairs down.',
  },
  4: { both: 'Light a plate and its door opens.' },
  5: {
    keys: "Space sets your candle down. It keeps shining, but without it you can only walk where it's lit. R restarts.",
    touch:
      "Tap yourself to set your candle down. It keeps shining, but without it you can only walk where it's lit. ↻ restarts.",
  },
  6: { both: 'A locked door unlocks while its plate is lit. Walk into it then and it stays open.' },
  7: { both: 'Lamps light their room, and light adds up.' },
  8: {
    keys: 'Space picks up the flashlight. You hold one light and pocket the other: F swaps.',
    touch: 'Tap yourself to pick up the flashlight. You hold one light and pocket the other: ⇄ swaps.',
  },
  9: { keys: 'Standing still, Q and E aim the flashlight.', touch: 'Standing still, ⟲ and ⟳ aim the flashlight.' },
  16: {
    keys: 'Mirrors bounce light. Space beside a mirror turns it.',
    touch: 'Mirrors bounce light. Tap a mirror nearby to turn it.',
  },
  24: { keys: 'Stand on a lever and press Space to pull it.', touch: 'Tap a lever nearby to pull it.' },
  25: {
    keys: 'A wheel turns a mirror somewhere. Space on the wheel turns it.',
    touch: 'A wheel turns a mirror somewhere. Tap the wheel to turn it.',
  },
};

// The controls, for the How to Play screen.
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
