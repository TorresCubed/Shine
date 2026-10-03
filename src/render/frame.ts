// What every part of the drawing shares for the frame being drawn.

// This frame's time, for animation (set by draw).
export let frameTime = 0;
export const setFrameTime = (now: number) => {
  frameTime = now;
};

// How the world is shown. 'normal' is the game. The other two are for playtesting levels from the
// editor: 'fog' shows the whole level as if already explored, with every light's reach drawn (not
// just what's in line of sight); 'bright' shows the whole level fully lit, with light as a tinted
// overlay. Either way, doors and mirrors always show as they are.
export type ViewMode = 'normal' | 'fog' | 'bright';
export let viewMode: ViewMode = 'normal';
export const setViewMode = (mode: ViewMode) => {
  viewMode = mode;
};
export const nextViewMode = () => {
  viewMode = viewMode === 'fog' ? 'bright' : viewMode === 'bright' ? 'normal' : 'fog';
};
