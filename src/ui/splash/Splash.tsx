import { useEffect, useRef } from 'preact/hooks';
import { splashShown, splashProgress, skipSplash } from './state';
import { cx } from '../cx';
import candleUrl from '../../assets/largeCandle.png';
import './Splash.css';

// largeCandle.png: 135 x 240. The glow centres on the flame; the body is centred on screen.
const CANDLE_W = 135;
const CANDLE_H = 240;
const GLOW_AT = { x: 65.5, y: 21 };
const BODY_CENTRE_X = 69.5;
// Rows of the candle showing above the screen's bottom: all of it, then just the top.
const OPENING_ROW = CANDLE_H;
const SETTLED_ROW = 120;

// Whole-number scale keeps the pixel art crisp: about half the screen's height.
const scale = () => Math.max(1, Math.floor((innerHeight * 0.55) / CANDLE_H));

// A few out-of-step waves, like the game's flames.
const flicker = (now: number) =>
  0.9 + 0.05 * Math.sin(now / 130) + 0.03 * Math.sin(now / 57 + 1.3) + 0.02 * Math.sin(now / 23 + 4.1);

// The candle behind the title screen, animated per frame through refs, not re-renders.
export const Splash = () => {
  const shown = splashShown.value;
  const rig = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const candle = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const { lit, sink } = splashProgress(now);
      const k = scale();

      const left = innerWidth / 2 - BODY_CENTRE_X * k;
      const fromTop = innerHeight - OPENING_ROW * k;
      const toTop = innerHeight - SETTLED_ROW * k;
      rig.current!.style.transform = `translate(${Math.round(left)}px, ${Math.round(fromTop + (toTop - fromTop) * sink)}px)`;
      Object.assign(candle.current!.style, {
        width: `${CANDLE_W * k}px`,
        height: `${CANDLE_H * k}px`,
        filter: `brightness(${0.25 + 0.75 * lit})`,
      });

      const size = Math.hypot(innerWidth, innerHeight) * 1.3;
      const f = flicker(now);
      Object.assign(glow.current!.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${GLOW_AT.x * k - size / 2}px`,
        top: `${GLOW_AT.y * k - size / 2}px`,
        opacity: String(lit * f),
        transform: `scale(${(0.35 + 0.65 * lit) * (0.98 + 0.03 * f)})`,
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  return (
    <div
      className={cx('splash', shown && 'shown')}
      onPointerDown={e => {
        e.stopPropagation();
        skipSplash();
      }}
    >
      <div className="splash-rig" ref={rig}>
        <div className="splash-glow" ref={glow} />
        <img className="splash-candle" ref={candle} src={candleUrl} alt="" />
      </div>
    </div>
  );
};
