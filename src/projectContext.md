Shine — Project Context

Concept: Sokoban-style haunted-mansion puzzle game (working title "Shine," not final). Small character carries a light source, explores in fog-of-war darkness. Grid-based movement/obstacles, locked doors, laser mechanics gated behind lever-controlled hidden mirrors (laser sits inert until mirrors are aligned via a separate puzzle).

Core design pillar: Light must be 100% physically real — actual reflection/refraction simulation, not simplified 90-degree grid bounces. This is the central engineering showcase of the project, not a stretch goal.

Stack/platform choices:

Web-based: Canvas/WebGL, TypeScript/React, wrapped with Capacitor for mobile deployment
Chosen over Unity/Godot specifically because it reinforces the existing TS/React stack and is a stronger portfolio/engineering signal (manual raycasting math vs. an engine's built-in lighting)
First platform target: mobile
Being built as a portfolio piece while job searching — not a competitive/coworker project, not a pivot into game dev

Mechanics so far:

Character moves freely but snaps to grid; pushing a box triggers snap-to-grid
Single point light source at launch (no color/prism/polarization — explicitly future work)
Flashlight/beam mechanic (replacing laser for most puzzles) — shines forward for extended sight range; separate from close-range candle/lantern glow
Only one light active at a time; leaning toward being able to place the flashlight down (pick-up-able, not one-way) while moving with the candle
Placed-light use case: aim flashlight at a mirror, spin the mirror, watch for reflection hitting a target as angle feedback
Levers/buttons have hidden, undiscoverable-until-tried effects; mirror angles have no direct correctness feedback until tested

Current implementation state (canvas prototype):

Light: forward ray tracing (rayTracer.ts / castLight). Rays leave the light and bounce off mirrors until they hit a wall or run out of range/bounces. Neighbouring rays form strips, grouped by the chain of mirrors they bounced through; each group has one virtual source, which the radial falloff is centred on, so falloff tracks true path length. Rays are budgeted (120 candle / 24 flashlight base rays) and bisected adaptively only where neighbours hit different surfaces.
Rendering (renderer.ts): every lit region (direct + each mirror chain) is accumulated additively ('lighter'), so overlapping light adds. Reflected light keeps the source's warm tint.
Fog of war: a low-res grayscale memory mask holding the brightest each spot has ever been lit ('lighten' = per-pixel max), written with a smooth (1 - t^k)^2 falloff and upscaled with bilinear smoothing for soft edges. Remembered floor = dim floor x mask.
Levels: level data lives in levels.ts; loadLevel (consts.ts) swaps in walls/mirrors/start/goal/rules. Levels play in order (1: empty room, 2: L-shaped hallway with a desk), then loop back to 1; no level select. Start and goal always sit against an edge wall (future entrance/exit doors). Both levels are candle only. Start and goal markers are painted onto the floor, so they're hidden in darkness and remembered in fog. Walls show only where light reaches their faces (a few px deep), and are remembered in fog the same way. The light ignites over LIGHT_IGNITE_MS on level start. Reaching the goal shows a win overlay and freezes movement; Enter moves to the next level.
Frame rate capped at TARGET_FPS (60); a perf readout is drawn in the top-left corner.




### Questions