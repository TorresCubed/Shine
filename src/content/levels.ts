import type { Level } from '../core/types';
import { fromMap } from './levelFormat';
import type { LevelOptions } from './levelFormat';

// The levels, numbered in order. Each is kept as written (for the editor) and as built.
export const levelSources: { map: string[]; options: LevelOptions }[] = [];
export const levels: Level[] = [];
const level = (map: string[], options: LevelOptions = {}) => {
  levelSources.push({ map, options });
  levels.push(fromMap(`Level ${levels.length + 1}`, map, options));
};

// Level 1: an empty room. Just grid movement and the candle.
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
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
// prettier-ignore
level([
  "#############",
  "#######G#####",
  "#######.#####",
  "#S..........#",
  "#........P..#",
  "#############",
], { doors: { 1: { between: '7,3 7,2', opens: 'up' } } });

// Level 5: dropping the candle. The plate is too far from the door: holding the candle, the only
// spot that lights it and sees the door is two cells straight below the door (4,4). Stand there
// and the door opens, but step up to it and the plate goes dark and it shuts again. Drop the
// candle at (4,4) instead: from there it lights the plate, the doorway, and the exit (exactly 3
// cells away, ~15.3% brightness, just over the 15% the fear rule needs), so you can walk out.
// Geometry is tight: changing FLAME.candleRadius, LIGHT.litThreshold or the falloff can break this level.
// prettier-ignore
level([
  "##########",
  "####G#####",
  "####.#####",
  "#S......##",
  "###.....##",
  "###.....##",
  "###...P.##",
  "##########",
], { doors: { 1: { between: '4,3 4,2', opens: 'up' } } });

// Level 6: a locked door, and doing things in order. The plate is too far from the door to hold
// it lit and open the door at once: carry the candle over and the door re-locks on the way. Drop
// the candle between the two (e.g. (7,4)) so it lights the plate and your path to the door, walk
// over and open it, go back for the candle, and carry it down the dark corridor to the exit.
// prettier-ignore
level([
  "############",
  "#G........##",
  "#########.##",
  "#S........##",
  "#.........##",
  "#....P....##",
  "############",
], { doors: { 1: { kind: 'locked', between: '9,3 9,2', opens: 'up' } } });

// Level 7: a wall lamp, and light adding up. The 2-wide light door's plate is too far to hold it
// open while carrying the candle through, so the candle has to stay behind. Dropped at (4,7), it
// holds the door open and shines up through it, but the lamp's light starts too far past the door
// to walk into. Between the two is a band of cells neither light reaches 15% on alone, but that
// together they do: the only way from the candle's light into the lamp's. The lamp hangs on the
// right wall at (5,2) (on the top wall the beams shifted just enough to break the bridge). Moving
// the lamp, plate, door or drop spot will likely break it.
// prettier-ignore
level([
  "##########",
  "#.G...####",
  "#....L####",
  "#.....####",
  "#.....####",
  "#.....####",
  "###.######",
  "#......###",
  "#S.....###",
  "#......###",
  "#.....P###",
  "##########",
], { doors: { 1: { between: '3,7 3,6', opens: 'up' } } });

// Level 8: finding the flashlight. The plate is across the room from the light door, too far to
// hold lit while you're in the doorway, so the candle has to stay behind (e.g. around (5,6)) to
// hold the door open. A wall lamp lights the doorway and the room beyond, where the flashlight
// lies switched off. Pick it up and it switches on: with the candle left holding the door, it's
// your light for the long dark corridor round to the exit. Comfortable margins: the doorway gets
// light from both the candle and the lamp.
// prettier-ignore
level([
  "###############",
  "#..L..#########",
  "#....F.......G#",
  "#.....#########",
  "###.###########",
  "#.........#####",
  "#.........#####",
  "#S.....P..#####",
  "#.........#####",
  "###############",
], { doors: { 1: { between: '3,5 3,4', opens: 'up' } } });

// Level 9: hitting a far plate. You start with only the flashlight, aimed up. The plate (1) is at
// the far end of the room from the light door (a): aim the flashlight at it and keep it there while
// you walk to the door and out. A wall lamp lights the way down to the door.
// prettier-ignore
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
  "####.#",
  "####G#",
  "######",
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '4,9 4,10', opens: 'down' } } });

// Level 10: dropping the flashlight so its beam does two jobs. You start with only the flashlight,
// aimed up. The plate (1) and the exit door (a) sit in separate slots at the top of a long room.
// There's exactly one spot to drop the flashlight from which its widening beam reaches both the
// plate (opening the door) and the way out, so you can walk up inside the beam empty-handed.
// Anywhere else it can't be done, and there's no way to strand yourself.
// prettier-ignore
level([
  "######",
  "#1##G#",
  "#.##.#",
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
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '4,3 4,2', opens: 'up' } } });

// Level 11: unlocking from a distance. You start with only the flashlight, aimed down the hallway.
// The locked door (K) is in the top of a lamp-lit room; its plate (P) is at the far end of a long
// dark hallway leading away, out of sight from the doorway, so you can't hold the beam on it while
// you open the door. Drop the flashlight in the room aimed down the hallway (anywhere along row 6),
// walk to the door in the lamp's light and open it (it stays open), then go back for the flashlight
// and carry it out. Dropped anywhere, it can always be walked back to, so there's no trap.
// prettier-ignore
level([
  "################",
  "###########G####",
  "###########.####",
  "#########.....##",
  "#########.....##",
  "#########....L##",
  "#P............##",
  "#########....S##",
  "################",
], { held: 'flashlight', aim: 'left', doors: { 1: { kind: 'locked', between: '11,3 11,2', opens: 'up' } } });

// Level 12: two lights, two doors. You start with the candle in hand and the flashlight pocketed.
// Each door's plate is hidden from its own doorway: plate 1 behind a wall stub in the start room,
// plate 2 at the end of a hallway off the middle room. Drop the candle beside plate 1 (door a opens,
// and you switch to the flashlight), then in the middle room drop the flashlight aimed down the
// hallway at plate 2 (door b opens) and walk out empty-handed: the middle room's lamp and the exit
// lamp light the way. Carrying the candle through instead is a dead end (it can't hold plate 2
// from anywhere you can stand in light), but not a trap: the flashlight is still holding door a,
// so you can go back and swap.
// prettier-ignore
level([
  "################",
  "#######LG.######",
  "########.#######",
  "#######....#####",
  "#2........L#####",
  "#######....#####",
  "########.#######",
  "###..........###",
  "###........#.###",
  "###S.......#1###",
  "###..........###",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'up', doors: { 1: { between: '8,7 8,6', opens: 'up' }, 2: { between: '8,3 8,2', opens: 'up' } } });

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
// prettier-ignore
level([
  "################",
  "################",
  "######.2F#######",
  "######.#########",
  "#S........######",
  "#.............3#",
  "#.........######",
  "#1######.#######",
  "########G#######",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'down', doors: { 1: { between: '6,4 6,3', opens: 'up' }, 2: { between: '9,5 10,5', opens: 'right' }, 3: { between: '8,6 8,7', opens: 'down' } } });

// Level 14: a chain of doors, one flashlight at a time. A long lamp-lit hall with closets on both
// sides, each behind a light door and holding the plate for the next door; some also hold a
// flashlight, switched off. You can only carry one, so every flashlight ends up left behind
// shining on a plate to hold a door open. The chain, from the start:
//   plate 2 (open alcove by the start) -> door b -> plate 3 (+ flashlight) -> door c ->
//   plate 4 -> door d -> plate 5 (+ flashlight) -> door e -> plate 1 (+ flashlight) -> door a, the exit.
// Closet c has no flashlight, so fetch the first one back from plate 2: door b shuts, but the
// flashlight inside keeps plate 3 lit, so door c stays open. Then walk out empty-handed through the
// lamps' light.
// prettier-ignore
level([
  "###############",
  "#######G#######",
  "#######.#######",
  "####L......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####........1F#",
  "####.......####",
  "####......L####",
  "####.......####",
  "####.......####",
  "####.......####",
  "####........5F#",
  "#.4........####",
  "####.......####",
  "####.......####",
  "####L......####",
  "####.......####",
  "####.......####",
  "####.......####",
  "#F3........####",
  "####........2.#",
  "####.......####",
  "####.......####",
  "####....S.L####",
  "###############",
], { held: 'flashlight', stowed: [], aim: 'up', doors: { 1: { between: '7,3 7,2', opens: 'up' }, 2: { between: '4,22 3,22', opens: 'left' }, 3: { between: '4,15 3,15', opens: 'left' }, 4: { between: '10,14 11,14', opens: 'right' }, 5: { between: '10,8 11,8', opens: 'right' } } });

// Level 15: all four pieces at once. Candle in hand, flashlight pocketed. The locked door K leads
// to a dark corridor and the exit; its plate (1) is in a side room behind light door b, out of
// sight from K's doorway. Door b's plate (2) is at the bottom of a narrow slot, out of sight from
// b's doorway. So both lights have to be left on the floor at once: one holding b open, the other
// lighting plate 1. Then walk to K empty-handed in the lamp's light, open it (it stays open), and
// go back for a light to carry down the corridor. Either light can take either plate: e.g. the
// flashlight aimed down the slot at plate 2 and the candle by plate 1, or the candle in the slot
// and the flashlight shone through b onto plate 1 from the start room.
// prettier-ignore
level([
  "################",
  "#G.....#########",
  "######.#########",
  "######.#########",
  "#......L..#...1#",
  "#..............#",
  "#.........#....#",
  "#.........######",
  "#S........######",
  "#.##############",
  "#2##############",
  "################",
], { held: 'candle', stowed: ['flashlight'], aim: 'down', doors: { 1: { kind: 'locked', between: '6,4 6,3', opens: 'up' }, 2: { between: '9,5 10,5', opens: 'right' } } });

// Level 16: mirrors. Flashlight only. The exit door's plate (1) is round a corner from the exit; a
// mirror sits in the corner, starting turned the wrong way (45°). Turn it (Space) until it's at 135° (four
// turns), then drop the flashlight just past the plate aimed back along the corridor: it crosses the
// plate, bounces off the mirror and down the corridor to the exit, lighting your whole way out.
//
// Levels 16-23 are all flashlight only, so the fear rule decides them: once you drop the light, you
// can only walk where its beam (and its reflections) reaches. Lights can't be dropped on a plate, so
// the beam has to cross the plate from somewhere and then light the way out; the puzzle is setting
// the mirrors so one beam does both. Each was checked with the real ray tracer: every mirror
// setting, drop cell (plates excluded) and aim.
// prettier-ignore
level([
  "#########",
  "#|....1.#",
  "#.#######",
  "#.#######",
  "#S#######",
  "#.#######",
  "#G#######",
  "#########",
], { held: 'flashlight', stowed: [], aim: 'up', doors: { 1: { between: '1,4 1,5', opens: 'down' } }, mirrors: { '1,1': { angle: 45, control: 'turnable' } } });

// Level 17: a chain of two mirrors, one fixed and one you turn. Plate 1 is near the foot
// of a dead end off the top corridor. Turn the right-hand mirror to 45° (two turns) and drop the
// flashlight below the plate aimed up: the beam crosses the plate, goes up, off both mirrors and
// back down the far corridor to the exit. Dropped anywhere else, the plate or the way out is dark.
// prettier-ignore
level([
  "#######",
  "#|...|#",
  "#.###.#",
  "#.###1#",
  "#S###.#",
  "#.#####",
  "#G#####",
  "#######",
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '1,4 1,5', opens: 'down' } }, mirrors: { '1,1': { angle: 135 }, '5,1': { angle: 0, control: 'turnable' } } });

// Level 18: diagonals. Mirrors turn in 22.5° steps, so a mirror at an odd step (22.5°, 67.5°...) sends
// light off at 45°. The fixed mirror at the top (4,2) sits at 22.5°: only light coming
// up the diagonal from the bottom-left corner turns down towards the door. Turn the corner mirror
// (1,5) round to 22.5° (five turns) and drop the flashlight in the nook above the plate
// aimed down: the beam crosses the plate, runs down the wall, off the corner mirror up the diagonal,
// and off the top mirror down to the exit. (A mirror
// turning light by 45° catches only a sliver of the beam, too thin to walk; turning it by 135°
// catches it all, so both bounces here are the wide kind.)
// prettier-ignore
level([
  "#########",
  "#.#######",
  "#1#.|...#",
  "#.......#",
  "#.......#",
  "#|.....S#",
  "####.####",
  "####G####",
  "#########",
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '4,5 4,6', opens: 'down' } }, mirrors: { '4,2': { angle: 22.5 }, '1,5': { angle: 90, control: 'turnable' } } });

// Level 19: two mirrors to turn, in an open room. The plate is below the top-right mirror, the door
// below the top-left one. Turn the top-right mirror to 45° and the top-left one to 135°, then drop
// the flashlight just below the plate aimed up: across the plate, up, left along the top, down
// through the door. The pillar stops a shortcut straight to the top-left mirror.
// prettier-ignore
level([
  "###########",
  "#...|...|.#",
  "#....##...#",
  "#.......1.#",
  "#S........#",
  "####.######",
  "####G######",
  "###########",
], { held: 'flashlight', aim: 'right', doors: { 1: { between: '4,4 4,5', opens: 'down' } }, mirrors: { '4,1': { angle: 90, control: 'turnable' }, '8,1': { angle: 90, control: 'turnable' } } });

// Level 20: one mirror, two jobs, in two stages. The locked door (K) leads on to a light door (b)
// and the exit. Plate 1, in a notch below the mirror, unlocks K; plate 2, above it, opens b.
//   1. Turn the mirror to 135° and drop the flashlight at the foot of the notch aimed up, across plate
//      1: its light turns right to K. Walk to K and open it (it stays open), then go back along the
//      beam for the flashlight.
//   2. Turn the mirror on to 45° and drop the flashlight in the nook above plate 2 aimed down: its
//      light crosses the plate and turns right, through K and b, to the exit.
// prettier-ignore
level([
  "##############",
  "####.#########",
  "#...2..#######",
  "#......#######",
  "#...|.......G#",
  "#......#######",
  "#S.#1#.#######",
  "####.#########",
  "##############",
], { held: 'flashlight', aim: 'up', doors: { 1: { kind: 'locked', between: '6,4 7,4', opens: 'right' }, 2: { between: '10,4 11,4', opens: 'right' } }, mirrors: { '4,4': { angle: 90, control: 'turnable' } } });

// Level 21: two doors in a row, one beam. Door a is plate 1's, door b plate 2's, and the beam has to
// cross both plates and still light the way out. Turn both mirrors to 45° and drop the flashlight
// just before plate 1 aimed right: over plate 1, along the top, down, and along the bottom over
// plate 2, through both doors.
// prettier-ignore
level([
  "###########",
  "#|1.|######",
  "####.######",
  "####2######",
  "####.######",
  "#S..|...G##",
  "###########",
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '6,5 7,5', opens: 'right' }, 2: { between: '4,3 4,2', opens: 'up' } }, mirrors: { '1,1': { angle: 0, control: 'turnable' }, '4,1': { angle: 90, control: 'turnable' }, '4,5': { angle: 90, control: 'turnable' } } });

// Level 22: order matters. The mirror in the corridor has to be at 135° to turn the beam from past the
// plate down to the exit, but at 135° it blocks the corridor from the start side. So walk past it while
// it's edge-on (0°), turn it from the far side, and drop the flashlight at the end of the corridor
// aimed left across the plate. Turn it first and you're shut out, but not stuck: keep turning it
// back to edge-on.
// prettier-ignore
level([
  "###########",
  "#S...|..1.#",
  "#####.#####",
  "#####.#####",
  "#####G#####",
  "###########",
], { held: 'flashlight', aim: 'right', doors: { 1: { between: '5,2 5,3', opens: 'down' } }, mirrors: { '5,1': { angle: 0, control: 'turnable' } } });

// Level 23: both at once, both mirrors turnable. Two doors in a row (a: plate 1, b: plate 2), and the
// only beam that crosses both plates runs down from the nook above plate 1, off the bottom-left
// mirror up the diagonal over plate 2, and off the top mirror down through the doors. Both mirrors
// have to be at 22.5° (five turns each from 90°).
// prettier-ignore
level([
  "#######",
  "#.#####",
  "#1.|..#",
  "#.2...#",
  "#|...S#",
  "###.###",
  "###.###",
  "###.###",
  "###G###",
  "#######",
], { held: 'flashlight', aim: 'down', doors: { 1: { between: '3,5 3,6', opens: 'down' }, 2: { between: '3,6 3,7', opens: 'down' } }, mirrors: { '3,2': { angle: 90, control: 'turnable' }, '1,4': { angle: 90, control: 'turnable' } } });

// Level 24: levers. The exit door (a) is worked by a lever (1), not a plate: pull it (Space, standing
// on it) and the door opens; pull it again and it shuts.
// prettier-ignore
level([
  "#############",
  "#S....#....G#",
  "#...........#",
  "#.....#.....#",
  "#..1..#######",
  "#############",
], { doors: { 1: { kind: 'lever', between: '5,2 6,2', opens: 'right' } } });

// Level 25: a lever that turns a mirror. Level 16 again, but the corner mirror is lever-turned:
// Space can't turn it, only the lever (2) beside the start can, a step per pull. Pull it four times
// (to 135°), then drop the flashlight just past the plate aimed back along the corridor.
// prettier-ignore
level([
  "#########",
  "#|....1.#",
  "#.#######",
  "#.#######",
  "#.#######",
  "#S2######",
  "#.#######",
  "#G#######",
  "#########",
], { held: 'flashlight', aim: 'up', doors: { 1: { between: '1,5 1,6', opens: 'down' }, 2: 'lever' }, mirrors: { '1,1': { angle: 45, control: 2 } } });

// Level 26: one lever, two jobs. The lever (1) works the lever door (a) below the start, and also turns
// the corner mirror a step per pull. The mirror starts one step short of 90°, so it reaches 135° on the
// third pull, which leaves the door open: pull three times, then drop the flashlight just past plate 2
// aimed back along the corridor, and its light runs down through both doors. (Four pulls would shut
// the door.)
// prettier-ignore
level([
  "#########",
  "#|....2.#",
  "#.#######",
  "#.#######",
  "#S1######",
  "#.#######",
  "#.#######",
  "#G#######",
  "#########",
], { held: 'flashlight', aim: 'up', doors: { 1: { kind: 'lever', between: '1,4 1,5', opens: 'down' }, 2: { between: '1,5 1,6', opens: 'down' } }, mirrors: { '1,1': { angle: 67.5, control: 1 } } });

// prettier-ignore
level([
  "###########",
  "##.|##...##",
  "#......|.##",
  "#S.#|.|#..#",
  "######G#.1#",
  "########.##",
  "###########",
], { aim: 'right', doors: { 1: { between: '6,4 6,3', opens: 'up' } }, mirrors: { '3,1': { angle: 135, control: 'turnable' }, '7,2': { angle: 67.5, control: 'turnable' }, '4,3': { angle: 45, control: 'turnable' }, '6,3': { angle: 0, control: 'turnable' } } });

// prettier-ignore
level([
  "#########",
  "#....####",
  "#....####",
  "#..1#|..#",
  "#..#2...#",
  "#......S#",
  "#####.###",
  "#####.###",
  "###L...L#",
  "###..G..#",
  "#########",
], { stowed: ['flashlight'], aim: 'up', doors: { 1: { between: '5,6 5,7', opens: 'down' }, 2: { between: '5,7 5,8', opens: 'down' } }, mirrors: { '5,3': { angle: 0 } } });
