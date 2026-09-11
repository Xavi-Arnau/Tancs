import { BARREL_LAUNCH_HEIGHT, FALL_DAMAGE_PER_UNIT } from "./constants.js";
import { sampleTrajectory, simulateProjectile } from "./physics.js";
import { carveCrater, heightAt } from "./terrain.js";
import type {
  DamageEntry,
  GameStatus,
  PlayerState,
  ProjectileEvent,
  Terrain,
  TurnAction,
  TurnResolution,
} from "./types.js";
import { getWeapon } from "./weapons.js";

export interface ResolveShotParams {
  terrain: Terrain;
  players: PlayerState[];
  wind: number;
  actingSlot: 0 | 1;
  action: TurnAction;
}

export interface ResolveShotResult {
  terrain: Terrain;
  players: PlayerState[];
  resolution: TurnResolution;
  winnerPlayerId: string | null;
}

/**
 * Pure, framework-agnostic resolution of a single shot: simulates the projectile (one
 * segment for a normal shell, or a carrier plus several fragments for a "split" weapon),
 * carves terrain and applies splash damage cumulatively across every segment in order, and
 * settles any tanks left unsupported by the new terrain. Callers (the submit-turn function)
 * are responsible for persisting the returned terrain/players and the resolution log entry.
 */
export function resolveShot(params: ResolveShotParams): ResolveShotResult {
  const { wind, actingSlot, action } = params;
  const weapon = getWeapon(action.weaponId);
  const actingPlayer = params.players[actingSlot];

  const players = params.players.map((p) => ({
    ...p,
    inventory: p.inventory.map((entry) => ({ ...entry })),
  }));

  if (weapon.defaultAmmo !== "infinite") {
    const entry = players[actingSlot].inventory.find(
      (e) => e.weaponId === weapon.id,
    );
    if (!entry || entry.quantity <= 0) {
      throw new Error(`Player has no ammo for weapon: ${weapon.id}`);
    }
    entry.quantity -= 1;
  }

  const preShotTerrain = params.terrain;
  const startX = actingPlayer.tankX;
  const startY = heightAt(preShotTerrain, startX) + BARREL_LAUNCH_HEIGHT;

  const segments = simulateProjectile(weapon, {
    startX,
    startY,
    angle: action.angle,
    power: action.power,
    wind,
    terrain: preShotTerrain,
  });

  const carrierTickCount = segments[0].path.length - 1;
  let terrain = preShotTerrain;
  const projectiles: ProjectileEvent[] = [];

  segments.forEach((segment, i) => {
    const terrainDiff: ProjectileEvent["terrainDiff"] = [];
    const damage: DamageEntry[] = [];

    if (segment.impact) {
      const carved = carveCrater(terrain.heights, segment.impact.x, weapon.splashRadius);
      terrain = { width: terrain.width, heights: carved.heights };
      terrainDiff.push(...carved.diff);

      for (const player of players) {
        const distance = Math.abs(player.tankX - segment.impact.x);
        if (distance > weapon.splashRadius) continue;
        const falloff = Math.max(0, 1 - distance / weapon.splashRadius);
        const amount = Math.min(Math.round(weapon.damage * falloff), player.hp);
        if (amount <= 0) continue; // already dead this turn — no real event to record
        player.hp -= amount;
        damage.push({ playerId: player.playerId, amount, newHp: player.hp });
      }
    }

    projectiles.push({
      trajectory: sampleTrajectory(segment.path),
      tickCount: segment.path.length - 1,
      startTick: i === 0 ? 0 : carrierTickCount,
      impact: segment.impact,
      terrainDiff,
      damage,
    });
  });

  const tankFalls: TurnResolution["tankFalls"] = [];
  for (const player of players) {
    const fromY = heightAt(preShotTerrain, player.tankX);
    const toY = heightAt(terrain, player.tankX);
    if (toY < fromY) {
      const fallDamage = Math.round((fromY - toY) * FALL_DAMAGE_PER_UNIT);
      if (fallDamage > 0) {
        player.hp = Math.max(0, player.hp - fallDamage);
      }
      tankFalls.push({
        playerId: player.playerId,
        fromY,
        toY,
        fallDamage,
      });
    }
  }

  const deadPlayers = players.filter((p) => p.hp <= 0);
  let resultingGameStatus: GameStatus = "battle_phase";
  let winnerPlayerId: string | null = null;
  if (deadPlayers.length === 1) {
    resultingGameStatus = "game_over";
    winnerPlayerId =
      players.find((p) => p.hp > 0)?.playerId ?? null;
  } else if (deadPlayers.length > 1) {
    // Simultaneous double KO: game over, no winner.
    resultingGameStatus = "game_over";
    winnerPlayerId = null;
  }

  const resolution: TurnResolution = {
    wind,
    projectiles,
    tankFalls,
    resultingGameStatus,
  };

  return { terrain, players, resolution, winnerPlayerId };
}
