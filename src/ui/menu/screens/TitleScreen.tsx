import { GAME_TITLE, TAGLINE, AUTHOR } from "../../../content/about";
import { lastPlayed } from "../../../game/progress";
import { open } from "../../store";
import { useGame } from "../../GameContext";
import { MenuItem } from "../MenuItem";
import { levelLabel } from "../../levelLabel";

export const TitleScreen = () => {
  const { play, levelCount } = useGame();
  const last = lastPlayed();
  const canContinue = last !== null && last >= 1 && last <= levelCount;

  return (
    <>
      <h1 className="game-title">{GAME_TITLE}</h1>
      <p className="tagline">{TAGLINE}</p>
      <div className="menu-list">
        {canContinue ? (
          <>
            <MenuItem variant="primary" onClick={() => play(last - 1)}>Continue: {levelLabel(last - 1)}</MenuItem>
            <MenuItem onClick={() => play(0)}>Play from the start</MenuItem>
          </>
        ) : (
          <MenuItem variant="primary" onClick={() => play(0)}>Play</MenuItem>
        )}
        <MenuItem onClick={() => open('levels')}>Levels</MenuItem>
        <MenuItem onClick={() => open('howto')}>How to Play</MenuItem>
        <MenuItem onClick={() => open('credits')}>Credits</MenuItem>
      </div>
      <p className="byline">by {AUTHOR}</p>
    </>
  );
};
