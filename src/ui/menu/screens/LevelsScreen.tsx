import { useReducer } from "preact/hooks";
import { isCompleted, isPlayed, completedCount, resetProgress } from "../../../game/progress";
import { useGame } from "../../GameContext";
import { cx } from "../../cx";
import { MenuItem, BackButton } from "../MenuItem";
import { levelLabel } from "../../levelLabel";

export const LevelsScreen = () => {
  const { play, levelCount } = useGame();
  const [, refresh] = useReducer((n: number) => n + 1, 0); // progress lives in localStorage
  const done = completedCount();

  const reset = () => {
    if (!confirm('Forget which levels you\'ve finished?')) return;
    resetProgress();
    refresh(0);
  };

  return (
    <>
      <h2>Levels</h2>
      <p className="muted">{done} of {levelCount} finished</p>
      <div className="level-grid">
        {Array.from({ length: levelCount }, (_, i) => {
          const n = i + 1;
          // Never-played levels sit in fog, like an unvisited room.
          const state = isCompleted(n) ? 'done' : isPlayed(n) ? null : 'unplayed';
          return (
            <MenuItem key={n} className={cx('level-tile', state)} title={levelLabel(i)} onClick={() => play(i)}>
              <span className="level-number">{n}</span>
              {state === 'done' && <span className="level-check">✓</span>}
            </MenuItem>
          );
        })}
      </div>
      <div className="menu-row">
        {done > 0 && <MenuItem variant="quiet" onClick={reset}>Reset progress</MenuItem>}
        <BackButton />
      </div>
    </>
  );
};
