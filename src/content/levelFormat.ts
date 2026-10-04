import type { Door, DoorLeaf, FloorLight, GridPos, Lamp, Level, Lever, LightKind, Mirror, Wall } from '../core/types';
import { GRID_SIZE, MIRROR } from '../core/consts';
import { wrapAngle } from '../core/util';

// A level is a text map, one character per cell:
//   '#' wall   '.' floor   'S' start   'G' goal
//   'L' wall lamp (on a floor cell, hung on the wall next to it)
//   'F' flashlight to be found   'C' candle on the floor, lit
//   '|' mirror (see the `mirrors` option)
//   '1'-'9' the trigger (plate or lever) for door n   'P' same as '1'
// `doors`, keyed by trigger number: the edges each door sits on, e.g.
//   { 2: { between: '3,4 3,5', opens: 'up' } } (opens into 3,4), or between: ['3,4 3,5', '4,4 4,5'] for
//   a wider door. Each leaf hinges at the end against a wall unless `hinge` says. `kind: 'locked'` or
//   'lever' sets the kind; { 2: 'lever' } is a lever with no door, that only turns mirrors.
// `mirrors`, keyed by "x,y", one per mirror: `angle` in degrees (0 horizontal, steps of 22.5) and
//   optional `control`: 'turnable', or a lever number. Fixed without one.

export type LevelOptions = {
  held?: LightKind | null; // default: the candle
  stowed?: LightKind[];
  aim?: Side; // which way the player starts facing
  doors?: Record<number, Door['kind'] | DoorSpec>;
  mirrors?: Record<string, MirrorSpec>;
};
export type Side = keyof typeof AIMS;
export type DoorSpec = { kind?: Door['kind']; between: string | string[]; opens: Side; hinge?: Side };
export type MirrorSpec = { angle: number; control?: 'turnable' | number };

export const STEP_DEGREES = 180 / MIRROR.steps;
const AIMS = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
export const STEP: Record<Side, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// The side a lamp at (x, y) hangs on: the first wall next to it (up, right, down, left).
export const lampSide = (x: number, y: number, isWall: (x: number, y: number) => boolean) =>
  [STEP.up, STEP.right, STEP.down, STEP.left].find(([dx, dy]) => isWall(x + dx, y + dy));

// Throws the level's problem unless `ok`.
type Check = (ok: unknown, problem: string) => asserts ok;

// One door leaf, on the edge between two cells ("x,y x,y").
const doorLeaf = (check: Check, map: string[], edge: string, opens: Side, hinge?: Side): DoorLeaf => {
  const cells = edge
    .trim()
    .split(/\s+/)
    .map(c => c.split(',').map(Number));
  check(
    cells.length === 2 && cells.every(c => c.length === 2 && !c.some(isNaN)),
    `door edge '${edge}' should be two cells, like '3,4 3,5'`,
  );

  const [[ax, ay], [bx, by]] = cells;
  check(Math.abs(ax - bx) + Math.abs(ay - by) === 1, `door edge '${edge}' isn't between neighbouring cells`);
  for (const [x, y] of cells)
    check(map[y]?.[x] !== undefined && map[y][x] !== '#', `door edge '${edge}' has a wall or nothing at ${x},${y}`);

  const [ox, oy] = STEP[opens];
  const forwards = bx - ax === ox && by - ay === oy;
  check(
    forwards || (ax - bx === ox && ay - by === oy),
    `door '${edge}' can't open ${opens}: it has to open towards one of its two cells`,
  );

  const [fx, fy, ix, iy] = forwards ? [ax, ay, bx, by] : [bx, by, ax, ay];

  // A door opening up or down sits on an edge running left-right.
  const across = ox === 0;
  const ends: [Side, Side] = across ? ['left', 'right'] : ['up', 'down'];
  const wallAt = (side: Side) => map[iy + STEP[side][1]]?.[ix + STEP[side][0]] === '#';
  const end = hinge ?? (wallAt(ends[0]) || !wallAt(ends[1]) ? ends[0] : ends[1]);
  check(ends.includes(end), `door '${edge}' can only hinge ${ends.join(' or ')}`);

  // The edge is the `into` cell's side facing `from`: its left (or top) end in cells, then the hinge end.
  const edgeX = across || ox > 0 ? ix : ix + 1;
  const edgeY = !across || oy > 0 ? iy : iy + 1;
  const [hx, hy] = end === 'right' ? [1, 0] : end === 'down' ? [0, 1] : [0, 0];
  const hingeAt = { x: (edgeX + hx) * GRID_SIZE, y: (edgeY + hy) * GRID_SIZE };

  // Closed along the edge; open a quarter turn towards `into`.
  const closedAngle = Math.atan2(-STEP[end][1], -STEP[end][0]);
  const openAngle = closedAngle + wrapAngle(Math.atan2(oy, ox) - closedAngle);
  return {
    hinge: hingeAt,
    closedAngle,
    openAngle,
    into: { gridX: ix, gridY: iy },
    from: { gridX: fx, gridY: fy },
  };
};

export const fromMap = (name: string, map: string[], options: LevelOptions): Level => {
  const check: Check = (ok, problem) => {
    if (!ok) throw new Error(`${name}: ${problem}`);
  };
  const walls: Wall[] = [];
  const lampCells: GridPos[] = [];
  const mirrors: Mirror[] = [];
  const pickups: FloorLight[] = [];
  const startDropped: FloorLight[] = [];
  const triggers = new Map<number, GridPos>();
  let start: GridPos | undefined;
  let goal: GridPos | undefined;
  // Walls are merged into as few rectangles as possible (each adds four edges for the ray tracer).
  // `open`: the previous row's wall runs, keyed by span, which a run below can extend.
  let open = new Map<string, Wall>();

  map.forEach((row, y) => {
    const next = new Map<string, Wall>();
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const cell = { gridX: x, gridY: y };
      const centre = { x: (x + 0.5) * GRID_SIZE, y: (y + 0.5) * GRID_SIZE };
      switch (ch) {
        case '.':
          break;
        case 'S':
          start = cell;
          break;
        case 'G':
          goal = cell;
          break;
        case 'L':
          lampCells.push(cell);
          break;
        case 'F':
          pickups.push({ kind: 'flashlight', ...cell, ...centre, aimAngle: 0 });
          break;
        case 'C':
          startDropped.push({ kind: 'candle', ...cell, ...centre, aimAngle: 0 });
          break;
        case 'P':
          triggers.set(1, cell);
          break;
        case '|': {
          const spec = options.mirrors?.[`${x},${y}`];
          check(spec, `mirror at ${x},${y} needs an entry in the \`mirrors\` option, with its angle`);
          const step = spec.angle / STEP_DEGREES;
          check(
            Number.isInteger(step) && step >= 0 && step < MIRROR.steps,
            `mirror at ${x},${y} has angle ${spec.angle}: it should be 0 up to 180, in steps of ${STEP_DEGREES}`,
          );
          mirrors.push({ ...cell, step, control: spec.control ?? 'fixed' });
          break;
        }
        case '#': {
          let end = x;
          while (row[end + 1] === '#') end++;
          const key = `${x},${end}`;
          let wall = open.get(key);
          if (wall) wall.h += GRID_SIZE;
          else walls.push((wall = { x: x * GRID_SIZE, y: y * GRID_SIZE, w: (end - x + 1) * GRID_SIZE, h: GRID_SIZE }));
          next.set(key, wall);
          x = end;
          break;
        }
        default:
          check(ch >= '1' && ch <= '9', `unknown character '${ch}' at ${x},${y}`);
          triggers.set(Number(ch), cell);
      }
    }
    open = next;
  });

  check(start && goal, 'map needs an S and a G');
  const levers: Lever[] = [];
  const doors: Door[] = [];

  for (const n of Object.keys(options.doors ?? {}).map(Number))
    check(triggers.has(n), `door ${n} has no trigger (put a '${n}' on the map)`);

  for (const [n, trigger] of triggers) {
    const option = options.doors?.[n];
    const spec = typeof option === 'string' ? { kind: option } : option;
    const kind = spec?.kind ?? 'light';
    if (kind === 'lever') levers.push({ ...trigger, id: n });
    if (!spec || !('between' in spec)) {
      check(kind === 'lever', `plate ${n} has no door (add it to the \`doors\` option)`);
      continue;
    }
    const leaves = [spec.between].flat().map(e => doorLeaf(check, map, e, spec.opens, spec.hinge));
    doors.push({ kind, trigger, leaves });
  }
  // Every mirror has an entry (see '|'), so this covers them all.
  for (const [key, { control }] of Object.entries(options.mirrors ?? {})) {
    check(
      mirrors.some(m => `${m.gridX},${m.gridY}` === key),
      `no mirror at ${key}`,
    );
    check(
      typeof control !== 'number' || levers.some(l => l.id === control),
      `mirror at ${key} is turned by ${control}, which isn't a lever`,
    );
  }
  const lamps: Lamp[] = lampCells.map(c => {
    const side = lampSide(c.gridX, c.gridY, (x, y) => map[y]?.[x] === '#');
    check(side, `lamp at ${c.gridX},${c.gridY} needs a wall next to it`);
    return { ...c, toWallX: side[0], toWallY: side[1] };
  });

  return {
    name,
    start,
    goal,
    walls,
    doors,
    lamps,
    mirrors,
    levers,
    pickups,
    startDropped,
    width: Math.max(...map.map(row => row.length)),
    height: map.length,
    startHeld: options.held === undefined ? 'candle' : options.held,
    startStowed: options.stowed ?? [],
    startAim: AIMS[options.aim ?? 'down'],
  };
};
