import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

// What the UI can ask the game to do.
export type GameActions = {
  play: (index: number) => void; // start level `index` (from 0)
  restart: () => void;
  swapLights: () => void;
  levelCount: number;
};

export const GameContext = createContext<GameActions | null>(null);
export const useGame = () => useContext(GameContext)!;
