import { open, close, openFresh } from '../../store';
import { useGame } from '../../GameContext';
import { MenuItem } from '../MenuItem';

export const PauseScreen = () => {
  const { restart } = useGame();
  return (
    <>
      <h2>Paused</h2>
      <div className="menu-list">
        <MenuItem variant="primary" onClick={close}>
          Resume
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            restart();
          }}
        >
          Restart level
        </MenuItem>
        <MenuItem onClick={() => open('levels')}>Levels</MenuItem>
        <MenuItem onClick={() => open('howto')}>How to Play</MenuItem>
        <MenuItem onClick={() => openFresh('title')}>Title screen</MenuItem>
      </div>
    </>
  );
};
