import { useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { input, lightState, gameState, keysDown } from "../../core/state";
import { useGame } from "../GameContext";
import { useGameValue } from "../useGameValue";
import "./TouchButtons.css";

type ButtonProps = { title: string; children: ComponentChildren };
const noContextMenu = (e: Event) => e.preventDefault(); // long-press

const TapButton = ({ title, onPress, hidden, children }: ButtonProps & { onPress: () => void; hidden?: boolean }) => (
  <button
    className="touch-button"
    style={{ visibility: hidden ? 'hidden' : 'visible' }}
    title={title}
    aria-label={title}
    onContextMenu={noContextMenu}
    onClick={(e) => { e.stopPropagation(); onPress(); e.currentTarget.blur(); }}
  >
    {children}
  </button>
);

// Held down, it holds `key` down, as the keyboard would.
const HoldButton = ({ title, holdKey, children }: ButtonProps & { holdKey: string }) => {
  const release = () => keysDown.delete(holdKey);
  return (
    <button
      className="touch-button aim"
      title={title}
      aria-label={title}
      onContextMenu={noContextMenu}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); keysDown.add(holdKey); }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {children}
    </button>
  );
};

// On-screen buttons for what's otherwise on keys, shown once touch is used.
export const TouchButtons = () => {
  const { swapLights, restart } = useGame();
  const touch = useGameValue(() => input.touch);
  const playing = useGameValue(() => gameState.status === 'playing');
  const canSwap = useGameValue(() => lightState.stowed.length > 0) && playing;
  const aiming = useGameValue(() => lightState.held === 'flashlight') && playing;

  // Hidden mid-hold: let go.
  useEffect(() => {
    if (!aiming) { keysDown.delete('q'); keysDown.delete('e'); }
  }, [aiming]);

  if (!touch) return null;
  return (
    <>
      <div className="touch-bar">
        <TapButton title="Swap lights" onPress={swapLights} hidden={!canSwap}>⇄</TapButton>
        <TapButton title="Restart level" onPress={restart}>↻</TapButton>
      </div>
      {aiming && (
        <div className="aim-bar">
          <HoldButton title="Turn flashlight left" holdKey="q">⟲</HoldButton>
          <HoldButton title="Turn flashlight right" holdKey="e">⟳</HoldButton>
        </div>
      )}
    </>
  );
};
