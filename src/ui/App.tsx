import { render } from "preact";
import { GameContext } from "./GameContext";
import type { GameActions } from "./GameContext";
import { Splash } from "./splash/Splash";
import { Menu } from "./menu/Menu";
import { MenuButton } from "./play/MenuButton";
import { Hud } from "./play/Hud";
import { Hint } from "./play/Hint";
import { LevelCard } from "./play/LevelCard";
import { TouchButtons } from "./touch/TouchButtons";
import { Stick } from "./touch/Stick";
import "./theme.css";

// Everything over the game canvas.
const App = ({ actions }: { actions: GameActions }) => (
  <GameContext.Provider value={actions}>
    <Splash />
    <Menu />
    <MenuButton />
    <Hud />
    <Hint />
    <LevelCard />
    <TouchButtons />
    <Stick />
  </GameContext.Provider>
);

export const mountUi = (actions: GameActions) => render(<App actions={actions} />, document.getElementById('ui')!);
