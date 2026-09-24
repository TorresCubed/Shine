Shine — Project Context

Concept: Sokoban-style haunted-mansion puzzle game (working title "Shine," not final). Small character carries a light source, explores in fog-of-war darkness. Grid-based movement/obstacles, locked doors, laser mechanics gated behind lever-controlled hidden mirrors (laser sits inert until mirrors are aligned via a separate puzzle).

Core design pillar: Light must be 100% physically real — actual reflection/refraction simulation, not simplified 90-degree grid bounces. This is the central engineering showcase of the project, not a stretch goal.

Stack/platform choices:

Web-based: Canvas/WebGL, TypeScript/React, wrapped with Capacitor for mobile deployment
Chosen over Unity/Godot specifically because it reinforces the existing TS/React stack and is a stronger portfolio/engineering signal (manual raycasting math vs. an engine's built-in lighting)
First platform target: mobile
Being built as a portfolio piece while job searching — not a competitive/coworker project, not a pivot into game dev

Mechanics so far:

Character moves freely (any direction, PLAYER_SPEED), but collision stays on the grid: a square footprint can't overlap a wall cell or a door that isn't fully open, and slides along them. Interactions (plates, pickups, drop spot, the exit) use the cell the player's centre is in; pushing a box triggers snap-to-grid
Single point light source at launch (no color/prism/polarization — explicitly future work)
Flashlight/beam mechanic (replacing laser for most puzzles) — shines forward for extended sight range; separate from close-range candle/lantern glow
Hold at most one light at a time; lights can be dropped (they keep shining) and picked back up, so the candle and flashlight can both be out if one is on the floor. Fear rule: light is required for movement (see levels.md)
Placed-light use case: aim flashlight at a mirror, spin the mirror, watch for reflection hitting a target as angle feedback
Levers/buttons have hidden, undiscoverable-until-tried effects; mirror angles have no direct correctness feedback until tested

Current implementation state (canvas prototype), by file:

consts.ts: tuning values only. state.ts: all mutable game state (player, lights, doors, mirrors, level geometry) and loadLevel.
levels.ts: levels as text maps (legend at the top). Each level([...], options) call adds the next numbered level; options set the starting lights/aim and door kinds. Doors come in numbered pairs (trigger digit + door letter); a trigger is a light plate unless options make it a lever, and a door is a light door unless options (or 'K') make it locked. Mirrors are '-', '|', '/', '\'.
rayTracer.ts: forward ray tracing (castLight). Rays bounce off mirrors until they hit a wall or run out of range/bounces; neighbouring rays form strips grouped by mirror chain, each with one virtual source the falloff is centred on (so falloff tracks true path length). brightnessAt measures light with the same LIGHT_FALLOFF_STOPS the renderer draws with.
scene.ts: walls and mirrors as a flat segment list for the tracer, rebuilt only when geometry changes.
playerLogic.ts: free movement with grid collision (walls, doors not fully open) plus thin-segment collision for mirrors, corner assist, and the fear rule (empty-handed you can only move to points lit to LIT_THRESHOLD, with FEAR_REACH leniency; a dropped light's cell always counts as lit). Space is the one action key: in a lever's cell it pulls it (toggling its door and turning the mirrors linked to it), in a turnable mirror's cell it turns it a step (skipping angles that would hit you), otherwise it picks up / drops a light (switching to the pocketed one). Lights: carry at most one of each kind, one lit in hand; F swaps, the flashlight faces the way you walk (swinging round at FACING_TURN_DEG_PER_S); standing still, Q/E aim it (slow start, ramps up). Mirrors are fixed, turnable, or lever-turned (level option), shown by their pivot.
doorLogic.ts: light doors follow their plate and won't close on the player; lever doors follow their lever; locked doors unlock while their plate is lit and open for good when walked into. Doors are only passable fully open; a closed door is part of `walls`, blocking movement and light.
renderer.ts: all light is added together ('lighter'), then cut to the player's line of sight (computeView, which bounces off mirrors, so you see what a visible mirror reflects). Floor-level things (markers, lamps, plates, levers, pickups, mirrors) are painted into both the lit floor and the remembered floor, so they're hidden in darkness and remembered in fog. Walls show only where light reaches their faces. Fog memory: a low-res grayscale mask of the brightest each spot has been seen lit ('lighten' = per-pixel max). Rule: fog never updates what can't be seen, so doors and mirrors are drawn in fog as last seen (except a mirror turn you cause, which you see complete). Camera follows the player over a level-sized world canvas; zoom with wheel or +/- (in to 1.5x, out to the whole level).
main.ts: canvases, input, level progression (starts on the newest level while designing; Enter = next level, R = restart).
Levels: 1-3 darkness, 4-6 plates/doors/dropping the candle/locked door, 7 lamps and light adding up, 8-11 the flashlight, 12-15 two lights at once (14 is the chain capstone), 16 mirrors, 17 levers.

### Questions