import { completedCount } from "../../../game/progress";
import { open, openFresh } from "../../store";
import { useGame } from "../../GameContext";
import { MenuItem } from "../MenuItem";
import { CreditsList, LinksList } from "../Credits";

export const EndingScreen = () => {
  const { levelCount } = useGame();
  return (
    <>
      <h1 className="game-title">The End</h1>
      <p className="tagline">You found your way out. {completedCount()} of {levelCount} levels finished.</p>
      <p className="muted">Thanks for playing.</p>
      <CreditsList />
      <LinksList />
      <div className="menu-list">
        <MenuItem onClick={() => open('levels')}>Levels</MenuItem>
        <MenuItem onClick={() => openFresh('title')}>Title screen</MenuItem>
      </div>
    </>
  );
};
