import { INPUT } from '../../core/consts';
import { stickView } from '../store';
import './Stick.css';

// The on-screen stick: a ring where the drag began, and a knob under the thumb. Only while held.
export const Stick = () => {
  if (!stickView.value) return null;
  const { centre, knob } = stickView.value;
  return (
    <div
      className="stick"
      style={{ '--radius': `${INPUT.stick.radius}px`, transform: `translate(${centre.x}px, ${centre.y}px)` }}
    >
      <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
};
