import type { Door, FloorLight, GridPos, Lamp, Level, Lever, LightKind, Mirror, Wall } from "./interfaces";
import { GRID_SIZE } from "./consts";

// Levels are text maps, one character per grid cell:
//   '#' wall   '.' floor   'S' start   'G' goal (both against an edge wall: future entrance/exit)
//   'L' wall lamp: a floor cell next to a wall; the lamp hangs on that wall
//   'F' flashlight lying switched off, to be found      'C' candle standing on the floor, lit
//   '-' '|' '/' '\' mirror, at that starting angle. Fixed unless the `mirrors` option says otherwise
// Doors come in numbered pairs: a door is worked by its own pair's trigger.
//   '1'-'9'  trigger for pair 1-9     'a'-'i'  door for pair 1-9
//   'P'      trigger for pair 1       'D'      door for pair 1      'K'  locked door for pair 1
// A trigger is a light plate, and its door a light door, unless the level's `doors` option says
// otherwise: e.g. { doors: { 2: 'lever' } } makes pair 2's trigger a lever, or 'locked' makes its
// door a locked one. A lever doesn't need a door: it can just turn mirrors.
// The `mirrors` option, keyed by "x,y", makes a mirror 'turnable' (Space in its cell turns it) or turned by lever n
// (a step each pull): e.g. { mirrors: { '3,1': 'turnable', '5,4': 2 } }.
//
// Levels are numbered in the order they're added below; finishing the last loops back to the first.

type LevelOptions = {
  held?: LightKind | null;        // light in hand at the start (default: the candle)
  stowed?: LightKind[];           // lights in your pocket at the start
  aim?: keyof typeof AIMS;        // which way a flashlight starts aimed; point it where they should go
  doors?: Record<number, Door['kind']>;
  mirrors?: Record<string, 'turnable' | number>;
};

const AIMS = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
const MIRROR_CHARS: Record<string, number> = { '-': 0, '\\': 2, '|': 4, '/': 6 }; // steps of 22.5°

// Wall cells are merged into as few rectangles as possible (horizontal runs, then stacked runs with
// the same span), since every rectangle adds four edges for the ray tracer to test.
const fromMap = (name: string, map: string[], options: LevelOptions): Level => {
  const walls: Wall[] = [];
  const lampCells: GridPos[] = [];
  const mirrors: Mirror[] = [];
  const pickups: FloorLight[] = [];
  const startDropped: FloorLight[] = [];
  const pairs = new Map<number, { trigger?: GridPos; cells: GridPos[]; kind: Door['kind'] }>();
  const pair = (n: number) => {
    if (!pairs.has(n)) pairs.set(n, { cells: [], kind: options.doors?.[n] ?? 'light' });
    return pairs.get(n)!;
  };
  let start: GridPos | undefined;
  let goal: GridPos | undefined;
  let open = new Map<string, Wall>(); // runs in the previous row, keyed by span, still extendable

  map.forEach((row, y) => {
    const next = new Map<string, Wall>();
    for (let x = 0; x < row.length; x++) {
      const ch = row[x], cell = { gridX: x, gridY: y };
      if (ch === 'S') start = cell;
      else if (ch === 'G') goal = cell;
      else if (ch === 'L') lampCells.push(cell);
      else if (ch === 'F') pickups.push({ kind: 'flashlight', ...cell, aimAngle: 0 });
      else if (ch === 'C') startDropped.push({ kind: 'candle', ...cell, aimAngle: 0 });
      else if (ch in MIRROR_CHARS) mirrors.push({ ...cell, step: MIRROR_CHARS[ch], control: options.mirrors?.[`${x},${y}`] ?? 'fixed' });
      else if (ch === 'P') pair(1).trigger = cell;
      else if (ch >= '1' && ch <= '9') pair(Number(ch)).trigger = cell;
      else if (ch === 'D') pair(1).cells.push(cell);
      else if (ch === 'K') { pair(1).cells.push(cell); pair(1).kind = 'locked'; }
      else if (ch >= 'a' && ch <= 'i') pair(ch.charCodeAt(0) - 96).cells.push(cell);
      if (ch !== '#') continue;

      let end = x;
      while (row[end + 1] === '#') end++;
      const key = `${x},${end}`;
      let wall = open.get(key);
      if (wall) wall.h += GRID_SIZE;
      else walls.push(wall = { x: x * GRID_SIZE, y: y * GRID_SIZE, w: (end - x + 1) * GRID_SIZE, h: GRID_SIZE });
      next.set(key, wall);
      x = end;
    }
    open = next;
  });

  if (!start || !goal) throw new Error(`${name}: map needs an S and a G`);
  const levers: Lever[] = [];
  const doors: Door[] = [];
  for (const [n, p] of pairs) {
    if (!p.trigger) throw new Error(`${name}: door ${n} has no trigger`);
    if (p.kind === 'lever') levers.push({ ...p.trigger, id: n });
    if (p.cells.length === 0) {
      if (p.kind !== 'lever') throw new Error(`${name}: plate ${n} has no door`);
      continue;
    }
    const { gridX: x, gridY: y } = p.cells[0];
    const inHorizontalWall = map[y][x - 1] === '#' || map[y][x + 1] === '#';
    doors.push({ kind: p.kind, cells: p.cells, trigger: p.trigger, slide: inHorizontalWall ? 'x' : 'y' });
  }
  for (const m of mirrors) {
    if (typeof m.control === 'number' && !levers.some(l => l.id === m.control)) {
      throw new Error(`${name}: mirror at ${m.gridX},${m.gridY} is turned by lever ${m.control}, which isn't a lever`);
    }
  }
  // Each lamp hangs on the first adjacent wall found (up, right, down, left).
  const lamps: Lamp[] = lampCells.map(c => {
    const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dx, dy]) => map[c.gridY + dy]?.[c.gridX + dx] === '#');
    if (!side) throw new Error(`${name}: lamp at ${c.gridX},${c.gridY} needs a wall next to it`);
    return { ...c, toWallX: side[0], toWallY: side[1] };
  });

  return {
    name, start, goal, walls, doors, lamps, mirrors, levers, pickups, startDropped,
    width: Math.max(...map.map(row => row.length)),
    height: map.length,
    startHeld: options.held === undefined ? 'candle' : options.held,
    startStowed: options.stowed ?? [],
    startAim: AIMS[options.aim ?? 'down'],
  };
}

export const levels: Level[] = [];
const level = (map: string[], options: LevelOptions = {}) => {
  levels.push(fromMap(`Level ${levels.length + 1}`, map, options));
}

// Level 1: an empty room. Just grid movement and the candle.
level([
  "##############",
  "#............#",
  "#............#",
  "#............#",
  "#S...........#",
  "#...........G#",
  "#............#",
  "#............#",
  "#............#",
  "##############",
]);

// Level 2: a U-shaped hallway, 3 cells wide. Start and exit are close as the crow flies, but the
// middle block hides one from the other, so you have to walk the long way round.
level([
  "############",
  "#.S.####.G.#",
  "#...####...#",
  "#...####...#",
  "#...####...#",
  "#...####...#",
  "#..........#",
  "#..........#",
  "#..........#",
  "############",
]);

// Level 3: a small maze. Start in a room, then corridors of 1, 2 and 3 cells wide. Two dead ends:
// one down from the start room into a small closet, one off the 2-wide corridor to the right.
level([
  "##################",
  "#....#############",
  "#S..........######",
  "#....#####..######",
  "##.#######.......#",
  "##.#######..######",
  "##.#######..######",
  "##.#######..######",
  "##.#######.......#",
  "#...######......G#",
  "#...######.......#",
  "#...##############",
  "##################",
]);

// Level 4: light plates. A 2-wide hallway with the exit behind a door in the top wall, 6 cells
// along. The door's face comes into the light about 3 cells before you reach it; the plate, two
// cells past the doorway, only lights once you're at the door, so you see it closed first.
level([
  "#############",
  "#######G#####",
  "#######D#####",
  "#S..........#",
  "#........P..#",
  "#############",
]);

// Level 5: dropping the candle. The plate is too far from the door: holding the candle, the only
// spot that lights it and sees the door is two cells straight below the door (4,4). Stand there
// and the door opens, but step up to it and the plate goes dark and it shuts again. Drop the
// candle at (4,4) instead: from there it lights the plate, the doorway, and the exit (exactly 3
// cells away, ~15.3% brightness, just over the 15% the fear rule needs), so you can walk out.
// Geometry is tight: changing CANDLE_RADIUS, LIT_THRESHOLD or the falloff can break this level.
level([
  "##########",
  "####G#####",
  "####D#####",
  "#S......##",
  "###.....##",
  "###.....##",
  "###...P.##",
  "##########",
]);

// Level 6: a locked door, and doing things in order. The plate is too far from the door to hold
// it lit and open the door at once: carry the candle over and the door re-locks on the way. Drop
// the candle between the two (e.g. (7,4)) so it lights the plate and your path to the door, walk
// over and open it, go back for the candle, and carry it down the dark corridor to the exit.
level([
  "############",
  "#G........##",
  "#########K##",
  "#S........##",
  "#.........##",
  "#....P....##",
  "############",
]);

// Level 7: a wall lamp, and light adding up. The 2-wide light door's plate is too far to hold it
// open while carrying the candle through, so the candle has to stay behind. Dropped at (4,7), it
// holds the door open and shines up through it, but the lamp's light starts too far past the door
// to walk into. Between the two is a band of cells neither light reaches 15% on alone, but that
// together they do: the only way from the candle's light into the lamp's. The lamp hangs on the
// right wall at (5,2) (on the top wall the beams shifted just enough to break the bridge). Moving
// the lamp, plate, door or drop spot will likely break it.
level([
  "##########",
  "#.G...####",
  "#....L####",
  "#.....####",
  "#.....####",
  "#.....####",
  "###D######",
  "#......###",
  "#S.....###",
  "#......###",
  "#.....P###",
  "##########",
]);

// Level 8: finding the flashlight. The plate is across the room from the light door, too far to
// hold lit while you're in the doorway, so the candle has to stay behind (e.g. around (5,6)) to
// hold the door open. A wall lamp lights the doorway and the room beyond, where the flashlight
// lies switched off. Pick it up and it switches on: with the candle left holding the door, it's
// your light for the long dark corridor round to the exit. Comfortable margins: the doorway gets
// light from both the candle and the lamp.
level([
  "###############",
  "#..L..#########",
  "#....F.......G#",
  "#.....#########",
  "###D###########",
  "#.........#####",
  "#.........#####",
  "#S.....P..#####",
  "#.........#####",
  "###############",
]);

// Level 9: hitting a far plate. You start with only the flashlight, aimed up. The plate (1) is at
// the far end of the room from the light door (a): aim the flashlight at it and keep it there while
// you walk to the door and out. A wall lamp lights the way down to the door.
level([
  "######",
  "#...1#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#...L#",
  "#.S..#",
  "####.#",
  "####a#",
  "####G#",
  "######",
], { held: 'flashlight', aim: 'up' });

// Level 10: dropping the flashlight so its beam does two jobs. You start with only the flashlight,
// aimed up. The plate (1) and the exit door (a) sit in separate slots at the top of a long room.
// There's exactly one spot to drop the flashlight from which its widening beam reaches both the
// plate (opening the door) and the way out, so you can walk up inside the beam empty-handed.
// Anywhere else it can't be done, and there's no way to strand yourself.
level([
  "######",
  "#1##G#",
  "#.##a#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#....#",
  "#.SL.#",
  "######",
], { held: 'flashlight', aim: 'up' });

// Level 11: unlocking from a distance. You start with only the flashlight, aimed down the hallway.
// The locked door (K) is in the top of a lamp-lit room; its plate (P) is at the far end of a long
// dark hallway leading away, out of sight from the doorway, so you can't hold the beam on it while
// you open the door. Drop the flashlight in the room aimed down the hallway (anywhere along row 6),
// walk to the door in the lamp's light and open it (it stays open), then go back for the flashlight
// and carry it out. Dropped anywhere, it can always be walked back to, so there's no trap.
level([
  "################",
  "###########G####",
  "###########K####",
  "#########.....##",
  "#########.....##",
  "#########....L##",
  "#P............##",
  "#########....S##",
  "################",
], { held: 'flashlight', aim: 'left' });

// Level 12: two lights, two doors. You start with the candle in hand and the flashlight pocketed.
// Each door's plate is hidden from its own doorway: plate 1 behind a wall stub in the start room,
// plate 2 at the end of a hallway off the middle room. Drop the candle on plate 1 (door a opens,
// and you switch to the flashlight), then in the middle room drop the flashlight aimed down the
// hallway at plate 2 (door b opens) and walk out empty-handed: the middle room's lamp and the exit
// lamp light the way. Carrying the candle through instead is a dead end (it can't hold plate 2
// from anywhere you can stand in light), but not a trap: the flashlight is still holding door a,
// so you can go back and swap.
level([
  "################",
  "#######LG.######",
  "########b#######",
  "#######....#####",
  "#2........L#####",
  "#######....#####",
  "########a#######",
  "###..........###",
  "###........#.###",
  "###S.......#1###",
  "###..........###",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'up' });

// Level 13: going back for a light (bridge to level 14). Candle in hand, flashlight pocketed.
// Drop the flashlight aimed down at plate 1 (door a opens). In closet a, take its flashlight, aim
// it at plate 2 and drop it (door b opens). Closet b is a corridor with plate 3 at the far end and
// no flashlight; the candle can't hold it (drop it there and the way back is dark, so pick it back
// up). Go back for your first flashlight: door a shuts, but the flashlight inside keeps plate 2
// lit, so door b stays open. Drop it aimed down the corridor at plate 3 and carry the candle out
// through door c. Plate 3 can't be seen from door c's doorway, so its light always has to be left
// behind. Plate 1 can't be seen from door a's doorway, so you can't hold it lit and get shut in
// closet a. Holding door a with the candle instead also works, and shows the carry limit: you
// can't take closet a's flashlight until you drop yours.
level([
  "################",
  "################",
  "######.2F#######",
  "######a#########",
  "#S........######",
  "#.........b...3#",
  "#.........######",
  "#1######c#######",
  "########G#######",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'down' });

// Level 14: a chain of doors, one flashlight at a time. A long lamp-lit hall with closets on both
// sides, each behind a light door and holding the plate for the next door; some also hold a
// flashlight, switched off. You can only carry one, so every flashlight ends up left behind
// shining on a plate to hold a door open. The chain, from the start:
//   plate 2 (open alcove by the start) -> door b -> plate 3 (+ flashlight) -> door c ->
//   plate 4 -> door d -> plate 5 (+ flashlight) -> door e -> plate 1 (+ flashlight) -> door a, the exit.
// Closet c has no flashlight, so fetch the first one back from plate 2: door b shuts, but the
// flashlight inside keeps plate 3 lit, so door c stays open. Then walk out empty-handed through the
// lamps' light.
level([
  "###############",
  "#######G#######",
  "#######a#######",
  "####L......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####.......e1C#",
  "####.......####",
  "####......L####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####.......d5F#",
  "#.4c.......####",
  "####.......####",
  "####.......####",
  "####L......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "#F3b.......####",
  "####........2.#",
  "####.......####",
  "####.......####",
  "####....S.L####",
  "###############",
], { held: 'flashlight', stowed: [], aim: 'up' });

// Level 15: all four pieces at once. Candle in hand, flashlight pocketed. The locked door K leads
// to a dark corridor and the exit; its plate (1) is in a side room behind light door b, out of
// sight from K's doorway. Door b's plate (2) is at the bottom of a narrow slot, out of sight from
// b's doorway. So both lights have to be left on the floor at once: one holding b open, the other
// lighting plate 1. Then walk to K empty-handed in the lamp's light, open it (it stays open), and
// go back for a light to carry down the corridor. Either light can take either plate: e.g. the
// flashlight aimed down the slot at plate 2 and the candle by plate 1, or the candle in the slot
// and the flashlight shone through b onto plate 1 from the start room.
level([
  "################",
  "#G.....#########",
  "######.#########",
  "######K#########",
  "#......L..#...1#",
  "#.........b....#",
  "#.........#....#",
  "#.........######",
  "#S........######",
  "#.##############",
  "#2##############",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'down' });


// Level 16: mirrors. Flashlight in hand, candle pocketed. The exit door's plate (1) is down a
// corridor round a corner from the flashlight's reach; a mirror sits in the corner, starting turned
// the wrong way ('\'). Turn it with T until it's '/' (four turns): then a flashlight dropped anywhere
// in the long corridor, aimed up, bounces off it onto the plate. Carrying the flashlight doesn't
// work (step out of the corridor and the beam leaves the mirror), so drop it and walk out with the
// candle.
level([
  "#########",
  "#\\....1.#",
  "#.#######",
  "#.#######",
  "#S#######",
  "#a#######",
  "#G#######",
  "#########",
], { held: 'flashlight', stowed: [], aim: 'up', mirrors: { '1,1': 'turnable' } });

// Level 17: levers. The exit door (a) is worked by a lever (1), not a plate: pull it with T and the
// door opens; pull it again and it shuts.
// level([
//   "#############",
//   "#S....#....G#",
//   "#.....a.....#",
//   "#.....#.....#",
//   "#..1..#######",
//   "#############",
// ], { doors: { 1: 'lever' } });
