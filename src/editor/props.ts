import { STEP_DEGREES } from '../content/levelFormat';
import { MIRROR } from '../core/consts';
import { renderDoorProps } from './doorProps';
import { pairsInUse } from './levelCode';
import { $, button, ed, page, row, tryAt } from './model';

// The Selected panel: a try-light's aim, a mirror's angle and control, or what a trigger works.
export const renderProps = () => {
  const el = $('props');
  el.innerHTML = '';
  el.className = '';
  const door = ed.selectedDoor !== null ? ed.doc.doors[ed.selectedDoor] : undefined;
  if (door && ed.selectedDoor !== null) {
    renderDoorProps(el, ed.selectedDoor, door);
    return;
  }
  const c = ed.selected && ed.doc.grid[ed.selected.y]?.[ed.selected.x];
  if (!ed.selected || !c) {
    el.className = 'hint';
    el.textContent = 'Nothing selected.';
    return;
  }
  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `Cell ${ed.selected.x},${ed.selected.y}`;
  el.appendChild(head);

  const t = ed.tries[tryAt(ed.selected.x, ed.selected.y)];
  if (t) {
    if (t.kind === 'flashlight') {
      const dirs: [string, number][] = [
        ['→', 0],
        ['↘', 45],
        ['↓', 90],
        ['↙', 135],
        ['←', 180],
        ['↖', 225],
        ['↑', 270],
        ['↗', 315],
      ];
      const setAim = (a: number) => {
        t.aim = ((a % 360) + 360) % 360;
        ed.lastAim = t.aim;
        page.refresh();
      };
      const input = document.createElement('input');
      input.type = 'number';
      input.value = String(t.aim);
      input.style.width = '56px';
      input.onchange = () => setAim(Number(input.value) || 0);
      el.append(
        row('Try flashlight, aimed', ...dirs.map(([s, a]) => button(s, t.aim === a, () => setAim(a)))),
        row(
          button('−5°', false, () => setAim(t.aim - 5)),
          input,
          '°',
          button('+5°', false, () => setAim(t.aim + 5)),
        ),
      );
    } else el.append(row('Try candle.'));
    el.append(
      row(
        button('Remove it', false, () => {
          ed.tries.splice(ed.tries.indexOf(t), 1);
          page.refresh();
        }),
      ),
    );
    return;
  }

  if (c.mirror) {
    const m = c.mirror;
    const angles = row('Angle');
    for (let s = 0; s < MIRROR.steps; s++)
      angles.appendChild(
        button(`${s * STEP_DEGREES}°`, s === m.step, () => {
          m.step = s;
          ed.mirrorDefaults = { ...m };
          page.refresh();
        }),
      );
    const sel = document.createElement('select');
    sel.add(new Option('nothing (fixed)', 'fixed'));
    sel.add(new Option('the player (Space)', 'turnable'));
    const levers = pairsInUse(ed.doc).filter(n => ed.doc.kinds[n] === 'lever');
    for (const n of levers) sel.add(new Option(`lever ${n}`, String(n)));
    if (typeof m.control === 'number' && !levers.includes(m.control))
      sel.add(new Option(`lever ${m.control} (missing!)`, String(m.control)));
    sel.value = String(m.control);
    sel.onchange = () => {
      m.control = sel.value === 'fixed' || sel.value === 'turnable' ? sel.value : Number(sel.value);
      ed.mirrorDefaults = { ...m };
      page.refresh();
    };
    el.append(angles, row('Turned by', sel));
    if (ed.preview?.[`${ed.selected.x},${ed.selected.y}`] !== undefined) {
      el.append(
        row(`Shown at ${ed.preview[`${ed.selected.x},${ed.selected.y}`] * STEP_DEGREES}° for the solution preview.`),
      );
    }
    return;
  }

  const n = c.ch >= '1' && c.ch <= '9' ? Number(c.ch) : 0;
  if (!n) {
    el.appendChild(document.createTextNode('Nothing to set here.'));
    return;
  }
  const what = ed.doc.kinds[n] === 'lever' ? 'Lever' : 'Plate';
  el.append(
    row(
      ed.doc.doors[n]
        ? `${what} ${n}: works door ${n}. Select the door to set it up.`
        : ed.doc.kinds[n] === 'lever'
          ? `Lever ${n}: no door, so it only turns mirrors.`
          : `Plate ${n}: no door yet. Use the Door tool with pair ${n}.`,
    ),
  );
};
