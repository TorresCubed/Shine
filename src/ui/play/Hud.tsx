import { useRef } from 'preact/hooks';
import { lightState, input } from '../../core/state';
import type { LightKind } from '../../core/types';
import { started, currentScreen } from '../store';
import { useGame } from '../GameContext';
import { cx } from '../cx';
import candleUrl from '../../assets/interactive/droppedCandle.png';
import flashlightUrl from '../../assets/interactive/droppedFlashlight.png';
import './Hud.css';

// Each light's crop of its 64px art, and how much to scale it.
const ICONS: Record<LightKind, { url: string; x: number; y: number; w: number; h: number; scale: number }> = {
  candle: { url: candleUrl, x: 25, y: 25, w: 14, h: 14, scale: 2 },
  flashlight: { url: flashlightUrl, x: 13, y: 20, w: 32, h: 18, scale: 1 },
};

const LightIcon = ({ kind }: { kind: LightKind }) => {
  const { url, x, y, w, h, scale } = ICONS[kind];
  return (
    <div
      className="hud-icon"
      style={{
        backgroundImage: `url("${url}")`,
        width: `${w * scale}px`,
        height: `${h * scale}px`, // (Preact 11 doesn't add px to numbers)
        backgroundSize: `${64 * scale}px ${64 * scale}px`,
        backgroundPosition: `${-x * scale}px ${-y * scale}px`,
      }}
    />
  );
};

// Counts how often `value` has changed since mount.
const useChangeCount = <T,>(value: T) => {
  const last = useRef(value);
  const count = useRef(0);
  if (last.current !== value) {
    last.current = value;
    count.current++;
  }
  return count.current;
};

type SlotProps = { kind: LightKind | null; label: string; className: string; onClick?: () => void };

// A slot pops when its light changes (re-keyed so the animation replays).
const Slot = ({ kind, label, className, onClick }: SlotProps) => {
  const changes = useChangeCount(kind);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      key={changes}
      className={cx('hud-slot', className, !kind && 'empty', changes > 0 && 'pop')}
      onClick={
        onClick &&
        ((e: MouseEvent) => {
          (e.currentTarget as HTMLElement).blur();
          onClick();
        })
      }
      title={onClick && 'Swap lights'}
      aria-label={onClick && 'Swap lights'}
    >
      {kind && <LightIcon kind={kind} />}
      <span className="hud-label">{label}</span>
    </Tag>
  );
};

// What you're carrying: the light in hand, and the one in your pocket (click to swap).
export const Hud = () => {
  const { swapLights } = useGame();
  const held = lightState.held.value;
  const pocketed = lightState.stowed.value[0] ?? null;
  const touch = input.touch.value;

  if (!started.value || currentScreen.value) return null;
  return (
    <div className="hud">
      <Slot kind={held} label="Hand" className="hud-hand" />
      <Slot kind={pocketed} label={touch ? '⇄' : 'F'} className="hud-pocket" onClick={swapLights} />
    </div>
  );
};
