import { levelCard } from "../store";
import { cx } from "../cx";
import { levelLabel } from "../levelLabel";
import "./LevelCard.css";

export const LevelCard = () => {
  const { index, shown } = levelCard.value;
  return (
    <div className={cx('level-card', shown && 'shown')}>
      <span className="card-title">{levelLabel(index)}</span>
    </div>
  );
};
