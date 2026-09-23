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

Forward ray tracing (rayTracer.ts / castLight) replaced the visibility-polygon + virtual-light approach (lightLogic.ts / mirrorLogic.ts, now unused). Rays leave the light and bounce off mirrors until they hit a wall or run out of range/bounces. Neighbouring rays form strips, grouped by the chain of mirrors they bounced through; each group has one virtual source, which the radial falloff is centred on. Rays are budgeted (120 candle / 24 flashlight base rays) and bisected adaptively only where neighbours hit different surfaces. The frame rate is capped at TARGET_FPS (30), and a perf readout is drawn in the top-left corner.
(Superseded) Mirror reflection via virtual-light technique (reflectPointAcrossLine, computeMirrorPolygon) — reflects the light point across the mirror line, casts from that virtual origin
Persistent "explored" canvas (fog-of-war memory, never cleared) layered under a live "currently lit" radial-falloff layer
Just fixed: mirror-reflected light wasn't fading with distance — the mirror polygon mask was flat/opaque instead of multiplied by a radial falloff. Fix: run the falloff gradient centered on virtualLight per-mirror, in a per-mirror loop, since each mirror has its own virtual light position and combining all mirrors into one mask before applying falloff breaks this.
Known unresolved item: multiple mirrors will additively double-brighten in overlapping reflected regions once more than one mirror exists — flagged but not yet solved ('lighter' vs 'source-over' blending decision deferred).
Recent TS fixes: type-only import needed for Mirror/Segment interfaces under verbatimModuleSyntax; a malformed mixed function-declaration/arrow-function syntax on getMirrorNormal caused an implicit-any error — resolved by using a plain function declaration.




### Questions