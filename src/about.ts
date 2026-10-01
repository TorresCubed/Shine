// Who made the game, and where to find them: shown on the title screen, in Credits and at the end.
// Leave a link's url empty to hide it.
export const GAME_TITLE = 'Shine';
export const TAGLINE = 'A puzzle game about light and the dark';
export const AUTHOR = 'Alexis T';
export const LINKS: { label: string; url: string }[] = [
  { label: 'Source on GitHub', url: 'https://github.com/TorresCubed/shine' },
  { label: 'Portfolio', url: '' },
  { label: 'LinkedIn', url: '' },
];
export const CREDITS: { role: string; who: string }[] = [
  { role: 'Design, code and art', who: AUTHOR },
  { role: 'Light', who: 'A hand-written ray tracer: real reflection, soft shadows, no engine' },
  { role: 'Levels', who: 'Built and checked in its own level editor and solver' },
];
