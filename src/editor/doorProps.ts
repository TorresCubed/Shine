import type { Side } from '../content/levelFormat';
import { parseEdge } from './levelCode';
import type { Doc, DoorKind } from './levelCode';
import { button, ed, page, row } from './model';

// A door's settings: which way it opens, its hinge, and what kind it is.
export const renderDoorProps = (el: HTMLElement, n: number, door: Doc['doors'][number]) => {
  const head = document.createElement('div');
  head.className = 'hint';
  head.textContent = `Door ${n}: ${door.edges.length} leaf${door.edges.length > 1 ? 'ves' : ''}`;
  el.appendChild(head);
  const [[ax], [bx]] = parseEdge(door.edges[0]);
  const across = ax === bx; // the edge runs left-right, so the door opens up or down
  const opens = document.createElement('select');
  for (const s of (across ? ['up', 'down'] : ['left', 'right']) as Side[]) opens.add(new Option(s, s));
  opens.value = door.opens;
  opens.onchange = () => {
    door.opens = opens.value as Side;
    page.refresh();
  };
  const hinge = document.createElement('select');
  hinge.add(new Option('the end against a wall', ''));
  for (const s of (across ? ['left', 'right'] : ['up', 'down']) as Side[]) hinge.add(new Option(`the ${s} end`, s));
  hinge.value = door.hinge ?? '';
  hinge.onchange = () => {
    if (hinge.value) door.hinge = hinge.value as Side;
    else delete door.hinge;
    page.refresh();
  };
  el.append(row('Opens', opens), row('Hinged at', hinge));
  if (ed.doc.kinds[n] === 'lever') el.append(row(`Worked by lever ${n}.`));
  else {
    const kind = document.createElement('select');
    kind.add(new Option('light door (open while lit)', 'light'));
    kind.add(new Option('locked door (opens for good)', 'locked'));
    kind.value = ed.doc.kinds[n] === 'locked' ? 'locked' : 'light';
    kind.onchange = () => {
      ed.doc.kinds[n] = kind.value as DoorKind;
      page.refresh();
    };
    el.append(row(`Plate ${n}'s`, kind));
  }
  el.append(
    row(
      button('Remove door', false, () => {
        delete ed.doc.doors[n];
        ed.selectedDoor = null;
        page.refresh();
      }),
    ),
  );
};
