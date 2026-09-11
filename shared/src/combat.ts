import { BARREL_LAUNCH_HEIGHT, FALL_DAMAGE_PER_UNIT } from "./constants.js";
import { sampleTrajectory, simulateProjectile } from "./physics.js";
import { carveCrater, heightAt } from "./terrain.js";
import type {
  DamageEntry,
  GameStatus,
  HazardZone,
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
  hazards: HazardZone[];
  turnNumber: number;
}

export interface ResolveShotResult {
  terrain: Terrain;
  players: PlayerState[];
  hazards: HazardZone[];
  resolution: TurnResolution;
  winnerPlayerId: string | null;
}

/**
 * Applies damage to a player, clamped to what's actually left, and reports nothing if the
 * player is already dead — shared by ordinary splash damage and hazard ticks so both stay
 * consistent: without this clamp, a hit against an already-dead tank would record an
 * inflated "amount," corrupting ReplayOverlay's backward HP reconstruction (which sums
 * recorded amounts to reconstruct "HP before this turn").
 */
function applyDamage(player: PlayerState, rawAmount: number): DamageEntry | null {
  const amount = Math.min(Math.round(rawAmount), player.hp);
  if (amount <= 0) return null;
  player.hp -= amount;
  return { playerId: player.playerId, amount, newHp: player.hp };
}

/**
 * Pure, framework-agnostic resolution of a single turn: ticks any pre-existing hazard zones
 * (e.g. Magma Strike's lava) against the acting player's own tank, then simulates the fired
 * projectile (one segment for a normal shell, or a carrier plus several fragments for a "split" weapon),
 * carves terrain and applies splash damage cumulatively across every segment in order, spawns
 * a new hazard zone if the weapon leaves one, and settles any tanks left unsupported by the
 * new terrain. Callers (the submit-turn function) are responsible for persisting the returned
 * terrain/players/hazards and the resolution log entry.
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

  // Hazard tick: zones that existed BEFORE this turn only damage the acting player's own
  // tank if it's standing in them — a zone shouldn't hurt the opponent as a side effect of
  // your turn, only on the turn that's actually theirs. Every zone still ages by one turn
  // regardless. A zone this turn's own shot creates (below) is deliberately not ticked yet —
  // it starts ticking next turn, so a Magma Strike impact doesn't both splash-damage and
  // lava-tick the same target in the same turn.
  const hazardDamage: DamageEntry[] = [];
  let hazards = params.hazards
    .map((zone) => {
      const actor = players[actingSlot];
      if (actor.tankX >= zone.startX && actor.tankX <= zone.endX) {
        const entry = applyDamage(actor, zone.damagePerTurn);
        if (entry) hazardDamage.push(entry);
      }
      return { ...zone, turnsRemaining: zone.turnsRemaining - 1 };
    })
    .filter((zone) => zone.turnsRemaining > 0);

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
  let hazardZoneCreated: HazardZone | null = null;

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
        const entry = applyDamage(player, weapon.damage * falloff);
        if (entry) damage.push(entry);
      }

      if (weapon.hazard && !hazardZoneCreated) {
        hazardZoneCreated = {
          id: `hz-${params.turnNumber}`,
          startX: Math.max(0, segment.impact.x - weapon.splashRadius),
          endX: Math.min(terrain.width - 1, segment.impact.x + weapon.splashRadius),
          damagePerTurn: weapon.hazard.damagePerTurn,
          turnsRemaining: weapon.hazard.turns,
        };
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

  if (hazardZoneCreated) hazards = [...hazards, hazardZoneCreated];

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
    hazardDamage,
    hazardZoneCreated,
    resultingGameStatus,
  };

  return { terrain, players, hazards, resolution, winnerPlayerId };
}
