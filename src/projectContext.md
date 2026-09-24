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

Current implementation state (canvas prototype):

Light: forward ray tracing (rayTracer.ts / castLight). Rays leave the light and bounce off mirrors until they hit a wall or run out of range/bounces. Neighbouring rays form strips, grouped by the chain of mirrors they bounced through; each group has one virtual source, which the radial falloff is centred on, so falloff tracks true path length. Rays are budgeted (120 candle / 24 flashlight base rays) and bisected adaptively only where neighbours hit different surfaces.
Rendering (renderer.ts): every lit region (direct + each mirror chain) is accumulated additively ('lighter'), so overlapping light adds. Reflected light keeps the source's warm tint.
Fog of war: a low-res grayscale memory mask holding the brightest each spot has ever been lit ('lighten' = per-pixel max), written with a smooth (1 - t^k)^2 falloff and upscaled with bilinear smoothing for soft edges. Remembered floor = dim floor x mask. Rule: fog of war never updates what can't be seen. Anything that changes (doors now, boxes/mirrors later) is drawn in the fog as it was last seen (e.g. door.seenOpenAmount), not as it currently is.
Levels: level data lives in levels.ts as text maps (legend at the top of levels.ts; doors and plates come in numbered pairs: plates '1'-'9', light doors 'a'-'i', with 'P'/'D'/'K' as shorthand for pair 1; a level can set its starting lights), converted into merged wall rectangles; loadLevel (consts.ts) swaps in walls/doors/mirrors/start/goal/rules. Levels play in order (1: empty room, 2: U-shaped hallway, 3: small maze, 4: light plate + door, 5: drop the candle to hold a door open, 6: locked door, order of actions, 7: fixed lamp, light adding up across a gap, 8: finding the flashlight, 9: dropping the flashlight so one beam lights a plate and your path), then loop back to 1; the game currently starts on the newest level (main.ts) while levels are being designed; no level select. R restarts the current level.
Line of sight (computeView in renderer.ts): each frame a no-bounce trace from the player gives what they can see. The lit layer and fog memory are masked to it; the fear rule, plates and doors use all light regardless.
Wall lamps ('L' in maps, on a floor cell next to a wall): hang on that wall and shine from its edge (2px out), like a candle but one cell further (LAMP_RADIUS); always on, walkable, don't ignite at level start.
Lights (lightState in consts.ts): you carry at most one of each kind (one candle, one flashlight); one light lit in hand (held), others carried switched off (stowed, F swaps), dropped lights stay lit on the floor, and unfound lights lie switched off in the level ('F' in maps = flashlight). Space picks up whatever light is on your cell (into hand, lit; the previous one gets stowed), or drops the one in hand if there's nothing there, switching straight to the pocketed light if you have one. Flashlight aim (player.aimAngle) is turned with Q/E, independent of movement; dropped flashlights keep their aim. Every light (held + dropped) is traced each frame and combined. Fear rule (playerLogic.ts): while empty-handed, you can only move to points lit to LIT_THRESHOLD (checked per axis, so you slide along the light's edge; you count as lit if any point within FEAR_REACH of your centre is). The whole cell of any dropped light always counts as lit. Walking straight into a wall with a gap just beside you nudges you sideways into it (CORNER_ASSIST).
Plates and doors (doorLogic.ts): two door kinds. A locked door ('K') is unlocked while its plate is lit; walking into it then opens it for good. A light door ('D') slides open (DOOR_OPEN_MS) while its plate is lit to LIT_THRESHOLD (15%), is only passable fully open, and won't close on the player. A closed door is part of `walls`, so it blocks movement and light like any wall. Brightness is measured with brightnessAt (rayTracer.ts), from the same LIGHT_FALLOFF_STOPS the renderer draws with. Start and goal always sit against an edge wall (future entrance/exit doors). All levels so far are candle only. Start and goal markers are painted onto the floor, so they're hidden in darkness and remembered in fog. Walls show only where light reaches their faces (a few px deep), and are remembered in fog the same way. The light ignites over LIGHT_IGNITE_MS on level start. Reaching the goal shows a win overlay and freezes movement; Enter moves to the next level.
Camera: everything is drawn onto a level-sized world canvas (all world layers, including fog memory, are sized to the level on load), then shown on screen through a camera that follows the player, clamped to the level's edges (a level smaller than the screen is centred). Zoom with the mouse wheel or +/-: in to 1.5x (CAMERA_MAX_ZOOM, to limit blur), out to where the whole level fits on screen.
Frame rate capped at TARGET_FPS (60); a perf readout is drawn in the top-left corner.




### Questions