import {
  AIRSTRIKE_PLANE_SPEED_BASE,
  BARREL_LAUNCH_HEIGHT,
  ESCAPE_CARVE_RADIUS,
  ESCAPE_CARVE_TRIGGER_DISTANCE,
  FALL_DAMAGE_PER_UNIT,
  SIM_DT,
} from "./constants.js";
import { sampleTrajectory, simulateProjectile } from "./physics.js";
import { getTankClass, maxHpFor } from "./tankClasses.js";
import { carveCrater, heightAt } from "./terrain.js";
import type {
  DamageEntry,
  GameStatus,
  HazardZone,
  PlayerState,
  ProjectileEvent,
  StatusExpiredEntry,
  StatusInflictedEntry,
  Terrain,
  TerrainDiffEntry,
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
 * Applies damage to a player, reduced by their active shield (if any) and then amplified by
 * their corroded vulnerability (if any), clamped to what's actually left, and reports nothing
 * if the player is already dead — shared by every damage source (splash, hazard ticks, burn
 * ticks) so all of them stay consistent: without this clamp, a hit against an already-dead tank
 * would record an inflated "amount," corrupting ReplayOverlay's backward HP reconstruction
 * (which sums recorded amounts to reconstruct "HP before this turn"). Since the shield/corrosion
 * adjustment happens here, DamageEntry.amount already reflects the final number — replay
 * reconstruction needs no separate awareness of either status.
 */
function applyDamage(player: PlayerState, rawAmount: number): DamageEntry | null {
  const shielded = player.shield ? rawAmount * (1 - player.shield.reduction) : rawAmount;
  const reduced = player.corroded ? shielded * (1 + player.corroded.amplify) : shielded;
  const amount = Math.min(Math.round(reduced), player.hp);
  if (amount <= 0) return null;
  player.hp -= amount;
  return { playerId: player.playerId, amount, newHp: player.hp };
}

/** Returns the angle a frozen player's shot must actually use — their last angle, regardless
 * of what they (or a stale client) requested. Power and the ability to fire are unaffected. */
export function resolveEffectiveAngle(player: PlayerState, requestedAngle: number): number {
  return player.frozen && player.frozen.turnsRemaining > 0 ? player.lastAngle : requestedAngle;
}

export interface TurnStartTickParams {
  terrain: Terrain;
  players: PlayerState[];
  hazards: HazardZone[];
  actingSlot: 0 | 1;
}

export interface TurnStartTickResult {
  terrain: Terrain;
  players: PlayerState[];
  hazards: HazardZone[];
  hazardDamage: DamageEntry[];
  burnDamage: DamageEntry[];
  hazardTerrainDiff: TerrainDiffEntry[];
  statusInflicted: StatusInflictedEntry[];
  statusExpired: StatusExpiredEntry[];
}

/**
 * Resolves everything that happens at the START of a turn, before any shot is fired — pure and
 * side-effect-free, and deliberately independent of what (if anything) the acting player is
 * about to do: hazard-zone damage/growth/sinking against the acting player's own tank, their own
 * burning tick, unconditional shield/frozen/burning/corroded decay for BOTH players, and any
 * corrosion a hazard zone's tick inflicts. Because it only depends on terrain/players/hazards —
 * never on a chosen weapon/angle/power — callers can invoke it purely for PREVIEW purposes too
 * (e.g. the client shows the player what's about to happen to them before they've picked a
 * weapon), not only as the first step of actually resolving a submitted shot (see resolveShot).
 */
export function resolveTurnStartTick(params: TurnStartTickParams): TurnStartTickResult {
  const { actingSlot } = params;
  const players = params.players.map((p) => ({ ...p }));

  // Statuses this tick inflicts are collected here so resolveShot can append its own
  // splash-inflicted statuses (frozen/burning) into the same log. pendingCorrosion is applied
  // further below, AFTER the status-tick decay loop — inflicting it directly during the hazard
  // loop would have that same decay loop immediately age it away the turn it starts, same
  // reasoning frozen/burning (inflicted by the fired shot itself) avoid by being applied after
  // decay too.
  const statusInflicted: StatusInflictedEntry[] = [];
  const pendingCorrosion: { playerId: string; amplify: number; turns: number }[] = [];

  // Hazard tick: zones that existed BEFORE this turn only damage the acting player's own
  // tank if it's standing in them — a zone shouldn't hurt the opponent as a side effect of
  // your turn, only on the turn that's actually theirs. Every zone still ages by one turn
  // regardless. A zone this turn's own shot creates is ticked starting next turn (resolveShot
  // appends it AFTER this function runs), so a Magma Strike impact doesn't both splash-damage
  // and lava-tick the same target in the same turn.
  const hazardDamage: DamageEntry[] = [];
  const hazardTerrainDiff: TerrainDiffEntry[] = [];
  let sunkTerrain = params.terrain;
  const hazards = params.hazards
    .map((zone) => {
      const actor = players[actingSlot];
      if (actor.tankX >= zone.startX && actor.tankX <= zone.endX) {
        const entry = applyDamage(actor, zone.damagePerTurn);
        if (entry) {
          hazardDamage.push(entry);
          if (zone.corrode) {
            pendingCorrosion.push({ playerId: actor.playerId, amplify: zone.corrode.amplify, turns: zone.corrode.turns });
          }
        }
      }
      // A sinking zone (e.g. Vat of Acid) eats further into the ground beneath it each tick,
      // independent of and in addition to any width growth below.
      if (zone.sinkPerTurn) {
        const startCol = Math.max(0, Math.min(sunkTerrain.width - 1, Math.round(zone.startX)));
        const endCol = Math.max(0, Math.min(sunkTerrain.width - 1, Math.round(zone.endX)));
        const newHeights = sunkTerrain.heights.slice();
        for (let x = startCol; x <= endCol; x++) {
          const oldHeight = newHeights[x];
          const newHeight = Math.max(0, oldHeight - zone.sinkPerTurn);
          if (newHeight !== oldHeight) {
            newHeights[x] = newHeight;
            hazardTerrainDiff.push({ x, oldHeight, newHeight });
          }
        }
        sunkTerrain = { width: sunkTerrain.width, heights: newHeights };
      }
      // A growing zone (e.g. Vat of Acid) widens a little further on every tick, same
      // clamping already used when a zone is first created.
      const grow = zone.growPerTurn ?? 0;
      return {
        ...zone,
        turnsRemaining: zone.turnsRemaining - 1,
        startX: Math.max(0, zone.startX - grow / 2),
        endX: Math.min(params.terrain.width - 1, zone.endX + grow / 2),
      };
    })
    .filter((zone) => zone.turnsRemaining > 0);

  // Burn tick: like a personal hazard zone that follows the burning player — only damages
  // them on their own turn, same reasoning as terrain hazard zones (shouldn't hurt anyone as
  // a side effect of someone else's turn). Every player's burning still decays every turn
  // regardless (see status tick below).
  const burnDamage: DamageEntry[] = [];
  const burningActor = players[actingSlot];
  if (burningActor.burning) {
    const entry = applyDamage(burningActor, burningActor.burning.damagePerTurn);
    if (entry) burnDamage.push(entry);
  }

  // Status tick: shield/frozen/burning/corroded age by one turn for BOTH players, every turn,
  // regardless of who's acting — mirrors HazardZone's own unconditional decay. A status this
  // turn's own shot inflicts/casts is ticked AFTER this (in resolveShot), so it isn't aged the
  // same turn it starts.
  const statusExpired: StatusExpiredEntry[] = [];
  for (const player of players) {
    if (player.shield) {
      const priorTurnsRemaining = player.shield.turnsRemaining;
      const turnsRemaining = priorTurnsRemaining - 1;
      if (turnsRemaining > 0) {
        player.shield = { ...player.shield, turnsRemaining };
      } else {
        player.shield = null;
        statusExpired.push({ playerId: player.playerId, type: "shield", priorTurnsRemaining });
      }
    }
    if (player.frozen) {
      const priorTurnsRemaining = player.frozen.turnsRemaining;
      const turnsRemaining = priorTurnsRemaining - 1;
      if (turnsRemaining > 0) {
        player.frozen = { turnsRemaining };
      } else {
        player.frozen = null;
        statusExpired.push({ playerId: player.playerId, type: "frozen", priorTurnsRemaining });
      }
    }
    if (player.burning) {
      const priorTurnsRemaining = player.burning.turnsRemaining;
      const turnsRemaining = priorTurnsRemaining - 1;
      if (turnsRemaining > 0) {
        player.burning = { ...player.burning, turnsRemaining };
      } else {
        player.burning = null;
        statusExpired.push({ playerId: player.playerId, type: "burning", priorTurnsRemaining });
      }
    }
    if (player.corroded) {
      const priorTurnsRemaining = player.corroded.turnsRemaining;
      const turnsRemaining = priorTurnsRemaining - 1;
      if (turnsRemaining > 0) {
        player.corroded = { ...player.corroded, turnsRemaining };
      } else {
        player.corroded = null;
        statusExpired.push({ playerId: player.playerId, type: "corroded", priorTurnsRemaining });
      }
    }
  }

  // Apply this tick's own corrosion now that decay above has already run, so it isn't aged the
  // same turn it starts (same reasoning resolveShot applies its own splash-inflicted statuses
  // after decay too).
  for (const pending of pendingCorrosion) {
    const player = players.find((p) => p.playerId === pending.playerId);
    if (!player) continue;
    player.corroded = { amplify: pending.amplify, turnsRemaining: pending.turns };
    statusInflicted.push({ playerId: pending.playerId, type: "corroded", amplify: pending.amplify, turns: pending.turns });
  }

  return {
    terrain: sunkTerrain,
    players,
    hazards,
    hazardDamage,
    burnDamage,
    hazardTerrainDiff,
    statusInflicted,
    statusExpired,
  };
}

/**
 * Pure, framework-agnostic resolution of a single turn: runs the start-of-turn tick (see
 * resolveTurnStartTick) against the acting player, then simulates the fired projectile (one
 * segment for a normal shell, or a carrier plus several fragments for a "split" weapon), carves
 * terrain and applies splash damage cumulatively across every segment in order, spawns a new
 * hazard zone if the weapon leaves one, and settles any tanks left unsupported by the new
 * terrain. Callers (the submit-turn function) are responsible for persisting the returned
 * terrain/players/hazards and the resolution log entry.
 */
export function resolveShot(params: ResolveShotParams): ResolveShotResult {
  const { wind, actingSlot, action } = params;
  const weapon = getWeapon(action.weaponId);

  const preTickPlayers = params.players.map((p) => ({
    ...p,
    inventory: p.inventory.map((entry) => ({ ...entry })),
  }));

  if (weapon.defaultAmmo !== "infinite") {
    const entry = preTickPlayers[actingSlot].inventory.find(
      (e) => e.weaponId === weapon.id,
    );
    if (!entry || entry.quantity <= 0) {
      throw new Error(`Player has no ammo for weapon: ${weapon.id}`);
    }
    entry.quantity -= 1;
  }

  const tick = resolveTurnStartTick({
    terrain: params.terrain,
    players: preTickPlayers,
    hazards: params.hazards,
    actingSlot,
  });

  const players = tick.players;
  const actingPlayer = players[actingSlot];
  let hazards = tick.hazards;
  const hazardDamage = tick.hazardDamage;
  const burnDamage = tick.burnDamage;
  const hazardTerrainDiff = tick.hazardTerrainDiff;
  const statusExpired = tick.statusExpired;
  const statusInflicted: StatusInflictedEntry[] = [...tick.statusInflicted];

  // Self-cast effects (Repair/Shield): applied directly to the caster, independent of aim.
  let selfEffect: TurnResolution["selfEffect"] = null;
  const caster = players[actingSlot];
  if (weapon.heal) {
    const before = caster.hp;
    caster.hp = Math.min(maxHpFor(caster.tankClass), caster.hp + weapon.heal);
    selfEffect = { playerId: caster.playerId, type: "heal", amount: caster.hp - before };
  } else if (weapon.shield) {
    caster.shield = { reduction: weapon.shield.reduction, turnsRemaining: weapon.shield.turns };
    selfEffect = {
      playerId: caster.playerId,
      type: "shield",
      reduction: weapon.shield.reduction,
      turns: weapon.shield.turns,
    };
  }

  const preShotTerrain = tick.terrain;
  const startX = actingPlayer.tankX;
  const startY = heightAt(preShotTerrain, startX) + BARREL_LAUNCH_HEIGHT;

  // Airstrike is unaimed — this shot-level randomness is decided here (once) rather than
  // inside the simulator, so the exact same values can be recorded below for the client's
  // cosmetic full-map plane-pass animation, independent of any individual bomb's own timing.
  let airstrikeFlight: TurnResolution["airstrikeFlight"] = null;
  let airstrikeParams: { airstrikeFromLeft?: boolean; airstrikeTotalTicks?: number; airstrikePlaneSpeed?: number } = {};
  if (weapon.projectile === "airstrike") {
    // Entry side is tied to the shooter, not randomized — support arrives from your own side
    // of the map (slot 0 spawns on the left half, slot 1 on the right; see initialTankX).
    const fromLeft = actingSlot === 0;
    const planeSpeed = AIRSTRIKE_PLANE_SPEED_BASE * (0.8 + Math.random() * 0.4);
    const totalTicks = Math.round(preShotTerrain.width / (planeSpeed * SIM_DT));
    airstrikeFlight = { fromLeft, totalTicks };
    airstrikeParams = { airstrikeFromLeft: fromLeft, airstrikeTotalTicks: totalTicks, airstrikePlaneSpeed: planeSpeed };
  }

  const segments = simulateProjectile(weapon, {
    startX,
    startY,
    angle: action.angle,
    power: action.power,
    wind,
    terrain: preShotTerrain,
    tankXs: players.map((p) => p.tankX),
    ...airstrikeParams,
  });

  let terrain = preShotTerrain;
  const projectiles: ProjectileEvent[] = [];
  let hazardZoneCreated: HazardZone | null = null;

  segments.forEach((segment) => {
    const terrainDiff: ProjectileEvent["terrainDiff"] = [];
    const damage: DamageEntry[] = [];

    if (segment.impact && weapon.projectile !== "instant") {
      const carved = carveCrater(terrain.heights, segment.impact.x, weapon.splashRadius);
      terrain = { width: terrain.width, heights: carved.heights };
      terrainDiff.push(...carved.diff);

      // Escape carve: this impact landed essentially on top of the shooter's own tank — most
      // often because they're wedged against steep adjacent terrain and every possible shot
      // detonates immediately. Guarantee real clearance centered on the tank itself (not just
      // the impact point), on top of the weapon's own crater, so repeated point-blank hits make
      // real progress toward freeing them instead of just digging a deeper personal pit.
      if (Math.abs(segment.impact.x - actingPlayer.tankX) <= ESCAPE_CARVE_TRIGGER_DISTANCE) {
        const rescue = carveCrater(terrain.heights, actingPlayer.tankX, ESCAPE_CARVE_RADIUS);
        terrain = { width: terrain.width, heights: rescue.heights };
        terrainDiff.push(...rescue.diff);
      }

      for (const player of players) {
        const distance = Math.abs(player.tankX - segment.impact.x);
        if (distance > weapon.splashRadius) continue;
        const falloff = Math.max(0, 1 - distance / weapon.splashRadius);
        const dealtMultiplier = getTankClass(actingPlayer.tankClass).damageMultiplier;
        const entry = applyDamage(player, weapon.damage * falloff * dealtMultiplier);
        if (entry) damage.push(entry);

        if (weapon.freeze && player.slot !== actingSlot) {
          player.frozen = { turnsRemaining: weapon.freeze.turns };
          statusInflicted.push({ playerId: player.playerId, type: "frozen", turns: weapon.freeze.turns });
        }

        if (weapon.burn) {
          player.burning = { damagePerTurn: weapon.burn.damagePerTurn, turnsRemaining: weapon.burn.turns };
          statusInflicted.push({
            playerId: player.playerId,
            type: "burning",
            damagePerTurn: weapon.burn.damagePerTurn,
            turns: weapon.burn.turns,
          });
        }
      }

      if (weapon.hazard && !hazardZoneCreated) {
        hazardZoneCreated = {
          id: `hz-${params.turnNumber}`,
          startX: Math.max(0, segment.impact.x - weapon.splashRadius),
          endX: Math.min(terrain.width - 1, segment.impact.x + weapon.splashRadius),
          damagePerTurn: weapon.hazard.damagePerTurn,
          turnsRemaining: weapon.hazard.turns,
          growPerTurn: weapon.hazard.growPerTurn,
          sinkPerTurn: weapon.hazard.sinkPerTurn,
          corrode: weapon.hazard.corrode,
          color: weapon.color,
        };
      }
    }

    projectiles.push({
      trajectory: sampleTrajectory(segment.path),
      tickCount: segment.path.length - 1,
      startTick: segment.startTick,
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
    hazardTerrainDiff,
    hazardZoneCreated,
    burnDamage,
    selfEffect,
    statusInflicted,
    statusExpired,
    airstrikeFlight,
    resultingGameStatus,
  };

  return { terrain, players, hazards, resolution, winnerPlayerId };
}
