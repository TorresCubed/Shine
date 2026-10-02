import { useEffect, useRef } from "preact/hooks";
import type { JSX } from "preact";
import { currentScreen, goBack } from "../store";
import type { Screen } from "../store";
import { TitleScreen } from "./screens/TitleScreen";
import { LevelsScreen } from "./screens/LevelsScreen";
import { HowToScreen } from "./screens/HowToScreen";
import { CreditsScreen } from "./screens/CreditsScreen";
import { PauseScreen } from "./screens/PauseScreen";
import { EndingScreen } from "./screens/EndingScreen";
import "./Menu.css";

const SCREENS: Record<Screen, () => JSX.Element> = {
  title: TitleScreen,
  levels: LevelsScreen,
  howto: HowToScreen,
  credits: CreditsScreen,
  pause: PauseScreen,
  ending: EndingScreen,
};

// The menus: an HTML overlay over the still-drawing game canvas.
export const Menu = () => {
  const screen = currentScreen.value;
  const panel = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);

  // Each new screen starts at the top, with its first option focused for the keyboard.
  useEffect(() => {
    if (!panel.current) return;
    panel.current.scrollTop = 0;
    panel.current.querySelector<HTMLElement>('.primary, .menu-item, .level-tile')?.focus({ preventScroll: true });
  }, [screen]);

  if (!screen) return null;
  const Screen = SCREENS[screen];

  // A click on the backdrop goes back, if the press started there (not a scroll dragged out).
  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    pressedBackdrop.current = e.target === e.currentTarget;
  };
  const onClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget && pressedBackdrop.current) goBack();
  };

  return (
    <div className="menu-overlay" data-screen={screen} onPointerDown={onPointerDown} onClick={onClick}>
      <div className="menu-panel" ref={panel}>
        <Screen />
      </div>
    </div>
  );
};
