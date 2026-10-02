import { CONTROLS } from "../../../content/help";
import { BackButton } from "../MenuItem";

const RULES = [
  'Find the stairs down out of each room.',
  'You\'re afraid of the dark: carrying a light, you can go anywhere, but put it down and you can only walk where it\'s lit.',
  'Light opens doors: shine on a door\'s plate and it opens, for as long as the light stays on it.',
  'Lights you put down keep shining, so you can be in two places at once.',
];

export const HowToScreen = () => (
  <>
    <h2>How to Play</h2>
    <div className="rules">
      {RULES.map(rule => <p key={rule}>{rule}</p>)}
    </div>
    <table className="controls">
      <thead>
        <tr><th /><th>Keyboard</th><th>Touch</th></tr>
      </thead>
      <tbody>
        {CONTROLS.map(c => (
          <tr key={c.does}>
            <td className="does">{c.does}</td>
            <td className="key">{c.keys}</td>
            <td className="key">{c.touch}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <BackButton />
  </>
);
