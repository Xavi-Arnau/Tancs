import type { PlayerState, TurnResolution } from "@tancs/shared";
import type { ActiveShotProjectile, DamagePopup } from "./TerrainCanvas";

// If a turn includes hazard-tick damage, give it this many ticks on screen by itself before
// the fired shot starts flying — otherwise both appear to happen at once, making a lava tick
// look like it came from the shot itself.
const HAZARD_PHASE_TICKS = 45;

export interface ShotAnimation {
  projectiles: ActiveShotProjectile[];
  damagePopups: DamagePopup[];
}

/** Builds the projectile list and floating "-N" popups for a turn's resolution, sequencing
 * any hazard-tick damage to play out before the fired shot begins when both are present. */
export function buildShotAnimation(players: PlayerState[], resolution: TurnResolution): ShotAnimation {
  const slotByPlayerId = new Map(players.map((p) => [p.playerId, p.slot]));
  const offset = resolution.hazardDamage.length > 0 ? HAZARD_PHASE_TICKS : 0;
  const popups: DamagePopup[] = [];

  for (const entry of resolution.hazardDamage) {
    const slot = slotByPlayerId.get(entry.playerId);
    if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
  }

  const projectiles: ActiveShotProjectile[] = resolution.projectiles.map((p) => ({
    trajectory: p.trajectory,
    tickCount: p.tickCount,
    startTick: p.startTick + offset,
    impact: p.impact,
    terrainDiff: p.terrainDiff,
  }));

  for (const projectile of resolution.projectiles) {
    const triggerTick = projectile.startTick + offset + projectile.tickCount;
    for (const entry of projectile.damage) {
      const slot = slotByPlayerId.get(entry.playerId);
      if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick, source: "shot" });
    }
  }

  return { projectiles, damagePopups: popups };
}
