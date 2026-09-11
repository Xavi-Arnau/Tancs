import { BARREL_LAUNCH_HEIGHT, FALL_DAMAGE_PER_UNIT } from "./constants.js";
import { sampleTrajectory, simulateProjectile } from "./physics.js";
import { carveCrater, heightAt } from "./terrain.js";
import type {
  DamageEntry,
  GameStatus,
  PlayerState,
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
 * Pure, framework-agnostic resolution of a single shot: simulates the projectile,
 * carves terrain, applies splash damage and inventory changes, and settles any tanks
 * left unsupported by the new terrain. Callers (the submit-turn function) are
 * responsible for persisting the returned terrain/players and the resolution log entry.
 */
export function resolveShot(params: ResolveShotParams): ResolveShotResult {
  const { terrain, wind, actingSlot, action } = params;
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

  const startX = actingPlayer.tankX;
  const startY = heightAt(terrain, startX) + BARREL_LAUNCH_HEIGHT;

  const simResult = simulateProjectile(weapon.projectile, {
    startX,
    startY,
    angle: action.angle,
    power: action.power,
    wind,
    terrain,
  });

  const trajectory = sampleTrajectory(simResult.path);

  let newTerrain = terrain;
  let terrainDiff: TurnResolution["terrainDiff"] = [];
  const damage: DamageEntry[] = [];

  if (simResult.impact) {
    const carved = carveCrater(
      terrain.heights,
      simResult.impact.x,
      weapon.splashRadius,
    );
    newTerrain = { width: terrain.width, heights: carved.heights };
    terrainDiff = carved.diff;

    for (const player of players) {
      const distance = Math.abs(player.tankX - simResult.impact.x);
      if (distance > weapon.splashRadius) continue;
      const falloff = Math.max(0, 1 - distance / weapon.splashRadius);
      const amount = Math.round(weapon.damage * falloff);
      if (amount <= 0) continue;
      player.hp = Math.max(0, player.hp - amount);
      damage.push({ playerId: player.playerId, amount, newHp: player.hp });
    }
  }

  const tankFalls: TurnResolution["tankFalls"] = [];
  for (const player of players) {
    const fromY = heightAt(terrain, player.tankX);
    const toY = heightAt(newTerrain, player.tankX);
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
    impact: simResult.impact,
    trajectory,
    terrainDiff,
    damage,
    tankFalls,
    resultingGameStatus,
  };

  return { terrain: newTerrain, players, resolution, winnerPlayerId };
}
