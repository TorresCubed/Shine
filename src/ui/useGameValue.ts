import { useEffect, useState } from "preact/hooks";

// Reads a value from the game's (non-reactive) state every frame, re-rendering only when it changes.
export const useGameValue = <T>(read: () => T): T => {
  const [value, setValue] = useState(read);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setValue(read);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);
  return value;
};
