# Shine — Level Roadmap

## Core rules

**Darkness is atmosphere first, a limitation second.** It's not a memory test: players aren't
expected to navigate from memory in the dark.

**Fear rule: light is required for movement.** The character is too frightened to leave the
light. While empty-handed, they can only move to points lit to at least **15%** brightness, by
any light source (movement is free, so you can walk right up to the edge of the light and along
it). While holding a light the rule doesn't apply: you always
stand in your own light. So the rule only matters once you've put your light down.

**Holding and dropping lights.** The character holds at most one light. The candle and flashlight
can both be out at once, but only if at least one of them is on the floor. A dropped light keeps
shining where it was left, and can be picked back up. This is the heart of the puzzles: the player often needs light in two places at
once. For example, a door opens while light hits it, but you can't both stand there lighting it
and walk through it. So you drop the candle to hold the door open, then leave, but only along a
path that some light still covers.

**Mirrors rotate in fixed steps.** The light physics stays exact, but the controls are coarse
(e.g. 8 or 16 orientations), and targets are generous in size. Rotating mirrors are a major
pillar, not a side feature.

## Puzzle expectations

- Everything needed to solve a level can be found inside that level.
- Mistakes are cheap: restart instantly. With the fear rule, you can strand yourself in the dark
  after dropping your light, so restart has to be always available and quick.
- Each level turns up only one or two of these dials:
  1. **Light coverage:** how much of the level your light can cover, which is now also how far
     you can move.
  2. **Navigation:** open room, then hallway, then branches.
  3. **Mechanic count:** how many systems interact in the level.
  4. **Solution depth:** number of steps and light bounces.
  5. **Hidden information:** e.g. levers with unknown effects.
- Every mechanic is introduced with teach, test, twist: introduced safely on its own, then
  tested, then combined with something earlier.

## Acts

### Act 1: Darkness (done)
Movement, the candle, and fog memory. The fear rule exists but never bites.
- **L1:** empty room, start and exit on opposite walls.
- **L2:** U-shaped hallway, 3 cells wide. Start and exit are close, but hidden from each other.
- **L3:** small maze. Start in a room; corridors 1–3 cells wide; two dead ends.

### Act 2: Light plates and dropping the candle
Introduces light plates, light-activated doors, dropping and picking up the light, and the fear
rule for real.
- **L4, light plates (teach, built):** the exit sits behind a door right next to you. The door's plate
  starts outside the candle's reach; walking up to the door brings the plate into your light,
  which opens the door. No dropping needed.
- **L5, dropping the candle (test, built):** the plate is around a corner from the door, or too far
  from it, so carrying the candle to the door never lights it. Drop the candle where it lights
  the plate and your way out, then leave inside its light.
- **L6, order of actions (twist, built):** a locked door. Carry the candle to it and the plate
  goes dark on the way, so it re-locks. Drop the candle so it lights the plate and your path to
  the door, open the door, go back for the candle, and carry it down a dark corridor to the exit.

Rules:
- **Locked doors:** unlocked only while their plate is lit (shown red when locked, green when
  unlocked). Walk into one while it's unlocked to open it; once open it stays open.
- **Plates and doors:** doors sit on the edges between cells, so they take up no room. A light door
  swings open while its plate is lit to at least 15%, and swings shut otherwise. You can only pass
  it fully open (so you can't light the plate, walk off, and slip through as it closes). It never
  swings into you: while you're in the cell it swings through, it stays put. Items on the floor
  don't stop it (the leaf passes over them), so a door can't be jammed with a dropped light, and
  since doors aren't cells, a light can never end up inside a shut door. While shut, a door
  blocks movement and light; mid-swing, light spills through the gap.
- **Candle reach limits door puzzles:** a cell counts as lit up to ~3 cells from the candle.
  With the exit directly behind a door, the drop spot must be exactly 2 cells in front of the
  door (any closer and you could just hold the candle there), which puts the exit right at the
  15% edge. Later door puzzles should give the exit more room, e.g. a longer light source
  (flashlight) or a lit space beyond the door.
- **Controls:** Space is the one action key, doing the first of: pull a lever in your cell; turn a
  turnable mirror in your cell; pick up the light on your cell; turn a turnable mirror you're
  facing close by (so pressing Space at a mirror never drops your light by mistake); drop the
  light in hand. Tapping (or clicking) does the same without the guesswork: tap a lever or turnable
  mirror within reach (its cell or the next one over) to pull or turn it; tap yourself to pick up or
  drop your light. Lights can't be dropped on a plate: a plate has to be lit from somewhere else, or
  every puzzle would come down to "put the light on the plate". Nor on a mirror or lever (turnable
  or not): nothing lands on those. Walking over a light does nothing. F swaps lights, Q/E aim the flashlight
  while standing still. R restarts the current level at any time.

**No start glow:** the start square used to be softly lit (a real light, 1.5 cells). It's gone: the
start is only as lit as your own light and the level's lamps make it.

### Act 2.5: Lamps and light that adds up
Wall lamps built into the level: they hang on a wall and shine from its edge, reach one cell
further than a candle, are always on, can't be carried, and can be walked past. Light from several sources adds, so a spot too dim for
either light alone can be bright enough from both.
- **L7 (built):** a light door held open by the dropped candle, with a wall lamp in the exit
  room. Past the door is a band of cells neither light reaches 15% on alone but together they do
  (~20%), the only bridge from the candle's light into the lamp's.

**Line of sight:** light exists everywhere it reaches (the fear rule and plates use all of it),
but the player only sees, and the fog of war only records, what's in their line of sight. So a
lamp in a closed room isn't visible through the walls.

### Act 3: Flashlight
- **L8, finding the flashlight (built):** drop the candle to hold a light door open, walk into a
  lamp-lit room, find the flashlight switched off, pick it up, and use it as your light down a long
  dark corridor to the exit (the candle stays behind holding the door).
- **L9, hitting a far plate (built):** start with only the flashlight; aim it at a plate at the
  far end of the room to open the door, and keep it there while you walk out.
- **L10, the dropped beam (built):** start with only the flashlight. The plate and the exit door
  sit in separate slots at the top of a long room; exactly one drop spot lets the widening beam
  reach both, so you can walk out inside it empty-handed. No way to strand yourself.
- **L11, unlocking from a distance (built):** a locked door in a lamp-lit room, its plate at the
  end of a long dark hallway out of sight from the door. Drop the flashlight aimed down the
  hallway, go open the door (it stays open), come back for the flashlight, and leave.
- **L12, two lights, two doors (built):** candle in hand, flashlight pocketed. The candle holds
  the first door, the dropped flashlight the second, and you walk out empty-handed through lamp
  light. Wrong order is a dead end you can back out of, not a trap.
- **L13, going back for a light (built, bridge to L14):** candle in hand, flashlight pocketed.
  Leave flashlights on two plates, find the third closet has none, and go back for the first:
  its door shuts, but the flashlight left inside keeps the next door open.
- **L15, all four pieces (built):** candle, flashlight, a light door and a locked door. The locked
  door's plate is behind the light door, and each plate is out of sight from its own doorway, so
  both lights must be left on plates at once; open the locked door empty-handed in lamp light,
  then go back for a light. Either light can take either plate.
- **L14, the chain (built):** a long lamp-lit hall with closets behind light doors, each holding
  the next door's plate and some a flashlight. You carry one flashlight at a time, so each is left
  shining on a plate to hold a door, and one has to be fetched back to reach a closet without one.

Picked up in the level. It's long-range and directional, and it gets its **own** kind of puzzle,
separate from mirrors. It lies in the level switched off ('F' in maps) until found; pick it up
(Space) and it switches on in hand while the candle goes into your pocket, switched off. F then
swaps the two. The flashlight faces the way you walk; standing still, Q/E swing it a full 360°
to look around. A dropped flashlight keeps its aim, and picking it up takes that aim back. A pocketed
light gives no light, so the fear rule applies if nothing is in hand.
- **A walkable beam:** dropped and aimed, it lights a long path across a room the candle can't
  cover, and the fear rule makes that beam the only way across.
- **Far triggers:** it hits light-activated things too far away for the candle.
- **Direction matters:** it lights one way only, so which way it points when you drop it is the
  puzzle.
- **Juggling two lights:** carry one while the other stays on the floor, and swap which is where.

### Act 4: Mirrors
Comes after the flashlight, because the candle's short range makes reflections barely matter.
Mirrors are thin two-sided segments across their cell ('-', '|', '/', '\' in maps). They block
movement only as that thin segment, so you can walk past one turned edge-on. Each is fixed,
turnable by the player (Space, standing in its cell: a step of 22.5°), or turned by a lever (a step
per pull). Nothing on the mirror shows which (for now: maybe three mirror arts later), so you find
out by trying. Mirrors are a bit
shorter than a cell, so you can stand in the cell beside one. A turn you cause shows completely,
even the parts of the mirror in fog. You can see what a mirror you can see reflects.
All of L16-23 are flashlight only, so the fear rule decides them: once the light is dropped, you
walk only where its beam and reflections reach. Lights can't be dropped on a plate, so one beam has
to cross the plate from somewhere and then carry on, via the mirrors, along the way out; each level
is about setting the mirrors so it does both. Every one was checked with the real ray tracer over
every mirror setting, drop cell (plates excluded) and aim, and each has exactly one solution.
- **L16, mirrors (built):** turn a corner mirror so the beam from the plate bounces round the corner
  and down to the exit.
- **L17, a chain (built):** one fixed mirror and one to turn; the beam goes up, off both, and back
  down the far corridor.
- **L18, diagonals (built):** a fixed mirror at a 22.5° angle only takes light coming up a diagonal;
  turn the corner mirror to an in-between angle to send it there. (A mirror turning light by 45°
  catches only a sliver of the beam, too thin to walk; by 135° it catches it all, so diagonal legs
  come from 135° turns.)
- **L19, two to turn (built):** two turnable mirrors in an open room; a pillar blocks the one-mirror
  shortcut.
- **L20, one mirror, two jobs (built):** stage 1 sets the mirror so plate 1's beam reaches a locked
  door; open it, fetch the flashlight, and re-turn the same mirror so plate 2's beam runs out
  through that door to a light door and the exit.
- **L21, two doors in a row (built):** one beam has to cross both plates and still light the way out.
- **L22, order matters (built):** the mirror you need blocks the corridor once set; walk past it
  edge-on and turn it from the plate's side.
- **L23, capstone (built):** two doors in a row and a diagonal, both mirrors turnable, both at an
  in-between angle.
- Next: lever-turned mirrors.

Map format: mirror characters give 0°, 45°, 90°, 135°; the level's `angles` option starts a mirror
at an in-between step.

### Levers
A lever is an alternative trigger to a plate (a level's `doors` option makes a pair's trigger a
lever): Space, standing on it, toggles its door open and shut, no light needed, and turns any mirrors linked to it. A
lever doesn't need a door; it can just turn mirrors.
- **L24, levers (built):** the simplest lever door.
- **L25, a lever that turns a mirror (built):** L16 again, but the corner mirror is lever-turned,
  so only the lever by the start turns it, a step per pull.
- **L26, one lever, two jobs (built):** the lever works the exit's lever door and turns the mirror;
  the mirror is only right on a pull that leaves the door open (the third).
- Next: a lever you have to reach after dropping the light (its cell lit by the beam), and levers
  whose effect you can't see from where you pull them.

### Later
From the project notes, order not decided yet:
- Boxes (Sokoban): pushing them; they block light and cast shadows.
- Levers and buttons with hidden effects.
- The laser, gated behind lever-controlled hidden mirrors.

## What each act needs built

| Act | New systems |
|---|---|
| 2 (L4) | Light plates; doors that open while their plate is lit (removed from collision and shadows when open); R to restart |
| 2 (L5) | Drop/pick-up (E); several light sources at once (carried + dropped); fear rule (when empty-handed, check the target cell is lit to at least 15% before each move). **Built; the L5 level itself isn't yet.** |
| 3 | Flashlight as a pickup; a dropped flashlight keeps its aim |
| 4 | Mirrors as level objects (the engine already traces them); rotation input in fixed steps; light targets |

## Open questions

None right now.
