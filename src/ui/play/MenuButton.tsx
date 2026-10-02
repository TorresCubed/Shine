import { started, currentScreen, open } from "../store";
import "./MenuButton.css";

export const MenuButton = () => {
  if (!started.value || currentScreen.value) return null;
  return (
    <button
      className="menu-button"
      title="Menu"
      aria-label="Menu"
      onClick={(e) => { e.currentTarget.blur(); open('pause'); }}
    >
      ☰
    </button>
  );
};
