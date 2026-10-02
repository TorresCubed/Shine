import { lampSource } from "../core/util";
import { castLight, castFlashlight, clearDistance } from "../light/rayTracer";
import type { LightGroup } from "../light/rayTracer";
import type { LightKind, Point, Scene } from "../core/types";
import { GRID_SIZE, SPRITES, LIGHT, FLAME, FLASHLIGHT } from "../core/consts";
import { player, lamps, lightState, gameState } from "../core/state";
import { skip } from "./debug";

// A held light shines from where it is in the player sprite. That reaches past your footprint, so up
// against a wall or mirror it's pulled back to just in front of it, never through. The flashlight's
// beam fills its lens: it starts far enough behind the lens (inside the arm, under the sprite) to be
// exactly lens-wide there.
const heldLightSource = (kind: LightKind, scene: Scene): Point => {
  const sprite = SPRITES.player[kind];
  const fx = (sprite.light.x - sprite.anchor.x) * SPRITES.playerScale;
  const fy = (sprite.light.y - sprite.anchor.y) * SPRITES.playerScale;
  const cos = Math.cos(player.aimAngle), sin = Math.sin(player.aimAngle);
  const aimed = { x: player.x + fx * cos - fy * sin, y: player.y + fx * sin + fy * cos };
  const reach = Math.hypot(fx, fy);
  const k = reach === 0 ? 0 : Math.max(0, Math.min(reach, clearDistance(scene, player, aimed) - 1)) / reach;
  const lens = { x: player.x + (aimed.x - player.x) * k, y: player.y + (aimed.y - player.y) * k };
  if (kind !== 'flashlight') return lens;

  const fullBack = SPRITES.player.flashlight.lensHalfHeight * SPRITES.playerScale / Math.tan(FLASHLIGHT.cone / 2);
  const behind = { x: lens.x - cos * fullBack, y: lens.y - sin * fullBack };
  const back = Math.max(0, Math.min(fullBack, clearDistance(scene, lens, behind) - 1));
  return { x: lens.x - cos * back, y: lens.y - sin * back };
}

// Every light this frame: the one in hand, dropped ones, the level's lamps. The player's lights
// ignite at level start; lamps are already burning.
export const castLights = (scene: Scene, now: number) => {
  const ignite = Math.min(1, Math.max(0, (now - gameState.startedAt) / LIGHT.igniteMs));
  const grow = 1 - (1 - ignite) ** 3;
  const range = (kind: LightKind) => (kind === 'flashlight' ? FLASHLIGHT.range : FLAME.candleRadius) * grow;

  // `seed` keeps each flame's flicker its own, and steady from frame to frame.
  const sources: { kind: LightKind; at: Point; aim: number; radius: number; seed: number }[] = [];
  if (lightState.held) {
    sources.push({ kind: lightState.held, at: heldLightSource(lightState.held, scene), aim: player.aimAngle, radius: range(lightState.held), seed: 1 });
  }
  for (const d of lightState.dropped) {
    // A dropped flashlight shines from its handle end, so its own cell is inside the beam, but never
    // from behind a wall, door or mirror it's been put down against.
    const cos = Math.cos(d.aimAngle), sin = Math.sin(d.aimAngle);
    const fullBack = d.kind === 'flashlight' ? FLASHLIGHT.back * GRID_SIZE : 0;
    const back = fullBack && Math.max(0, Math.min(fullBack, clearDistance(scene, d, { x: d.x - cos * fullBack, y: d.y - sin * fullBack }) - 1));
    sources.push({ kind: d.kind, at: { x: d.x - cos * back, y: d.y - sin * back }, aim: d.aimAngle, radius: range(d.kind), seed: 100 + d.gridX * 31 + d.gridY * 17 });
  }
  for (const l of lamps) sources.push({ kind: 'candle', at: lampSource(l), aim: 0, radius: FLAME.lampRadius, seed: 500 + l.gridX * 31 + l.gridY * 17 });

  const groups: LightGroup[] = [];
  let rayCount = 0;
  for (const s of sources) {
    const radius = Math.max(1, s.radius);
    const result = s.kind === 'flashlight'
      ? castFlashlight(s.at, s.aim, radius, scene, !skip.has('soft'))
      : castLight(s.at, 0, Math.PI * 2, FLAME.rayCount, radius, scene, LIGHT.maxMirrorBounces, true, !skip.has('soft'));
    if (s.kind !== 'flashlight') for (const g of result.groups) g.flame = s.seed;
    groups.push(...result.groups);
    rayCount += result.rayCount;
  }
  return { groups, rayCount, lightCount: sources.length };
}
