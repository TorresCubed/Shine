import { hint } from "../store";
import { cx } from "../cx";
import "./Hint.css";

// Always mounted, so it fades out with its text still showing.
export const Hint = () => {
  const { text, touch, shown } = hint.value;
  return <div className={cx('hint', touch && 'touch', shown && 'shown')}>{text}</div>;
};
