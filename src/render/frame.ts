// Shared by every part of the drawing.

export let frameTime = 0;
export const setFrameTime = (now: number) => {
  frameTime = now;
};

// 'normal' is the game. The playtest's 'fog' shows the whole level as explored with every light's
// reach; 'bright' shows it fully lit with light as a tint.
export type ViewMode = 'normal' | 'fog' | 'bright';
export let viewMode: ViewMode = 'normal';
export const setViewMode = (mode: ViewMode) => {
  viewMode = mode;
};
export const nextViewMode = () => {
  viewMode = viewMode === 'fog' ? 'bright' : viewMode === 'bright' ? 'normal' : 'fog';
};
