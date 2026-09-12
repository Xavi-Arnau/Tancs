import type {
  HazardZone,
  PlayerState,
  StatusExpiredEntry,
  StatusInflictedEntry,
  TurnResolution,
  TurnStartTickResult,
} from "@tancs/shared";
import type { ActiveShotProjectile, Caption, DamagePopup } from "./TerrainCanvas";

// If a turn includes hazard-tick damage, give it this many ticks on screen by itself before
// the fired shot starts flying — otherwise both appear to happen at once, making a lava tick
// look like it came from the shot itself. Only relevant to the "full" build (see buildShotAnimation's
// `tickAlreadyShown` param) — when the tick was already previewed separately, the shot starts
// immediately with no offset.
const HAZARD_PHASE_TICKS = 45;

export interface ShotAnimation {
  projectiles: ActiveShotProjectile[];
  damagePopups: DamagePopup[];
  hazardZoneCreated: HazardZone | null;
  selfEffect: TurnResolution["selfEffect"];
  statusInflicted: StatusInflictedEntry[];
  captions: Caption[];
  // Cosmetic full-map plane pass for an "airstrike" weapon — startTick already includes the
  // same pre-shot offset applied to every projectile's own startTick, so it stays in sync.
  airstrikeFlight: { fromLeft: boolean; totalTicks: number; startTick: number } | null;
}

export interface TickAnimation {
  damagePopups: DamagePopup[];
  statusInflicted: StatusInflictedEntry[];
  captions: Caption[];
}

/** "You"/opponent-name subject for a caption, from the mover's own point of view (mySlot). */
function subject(players: PlayerState[], playerId: string, mySlot: 0 | 1): { label: string; isMe: boolean } {
  const player = players.find((p) => p.playerId === playerId);
  const isMe = player?.slot === mySlot;
  return { label: isMe ? "You" : (player?.displayName ?? "Opponent"), isMe };
}

function statusExpiredCaption(players: PlayerState[], entry: StatusExpiredEntry, mySlot: 0 | 1): string {
  const { label, isMe } = subject(players, entry.playerId, mySlot);
  const noun =
    entry.type === "shield" ? "shield" : entry.type === "frozen" ? "frozen status" : entry.type === "burning" ? "burning" : "corrosion";
  return isMe ? `Your ${noun} wears off` : `${label}'s ${noun} wears off`;
}

/** Builds the projectile-less popups/captions for a turn's START-of-turn tick (hazard damage,
 * burn damage, terrain sinking, status decay/expiry, corrosion inflicted) — everything that's
 * independent of whatever the acting player is about to fire. Used to preview the tick live,
 * before the player has chosen a weapon (see BattleView), and shares its numbers 1:1 with
 * whatever the server will actually persist once they do fire (resolveTurnStartTick is pure and
 * nothing else can mutate game state on the acting player's own turn). */
export function buildTickAnimation(players: PlayerState[], tick: TurnStartTickResult, mySlot: 0 | 1): TickAnimation {
  const popups: DamagePopup[] = [];
  const captions: Caption[] = [];

  for (const entry of tick.hazardDamage) {
    const slot = players.find((p) => p.playerId === entry.playerId)?.slot;
    if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
    const { label, isMe } = subject(players, entry.playerId, mySlot);
    captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} damage from the hazard` : `${label} takes ${entry.amount} damage from the hazard` });
  }

  for (const entry of tick.burnDamage) {
    const slot = players.find((p) => p.playerId === entry.playerId)?.slot;
    if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
    const { label, isMe } = subject(players, entry.playerId, mySlot);
    captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} burn damage` : `${label} takes ${entry.amount} burn damage` });
  }

  if (tick.hazardTerrainDiff.length > 0) {
    captions.push({ triggerTick: 0, text: "The ground sinks beneath the hazard" });
  }

  for (const entry of tick.statusExpired) {
    captions.push({ triggerTick: 0, text: statusExpiredCaption(players, entry, mySlot) });
  }

  for (const entry of tick.statusInflicted) {
    if (entry.type !== "corroded") continue; // only corroded is ever inflicted by a tick
    const { label, isMe } = subject(players, entry.playerId, mySlot);
    captions.push({ triggerTick: 0, text: isMe ? `${label}'re corroded! Extra damage taken` : `${label} is corroded! Takes extra damage` });
  }

  return { damagePopups: popups, statusInflicted: tick.statusInflicted, captions };
}

/** Builds the projectile list, floating "-N" popups, and narrated captions for a turn's fired
 * shot. When `tickAlreadyShown` is true (the live-fire case in BattleView, where the turn's
 * start-of-turn tick was already separately previewed via buildTickAnimation before the player
 * chose their weapon), the tick's own hazard/burn popups and captions — and the pre-shot pause
 * that exists purely to separate them from the shot visually — are skipped, since they were
 * already shown; only the shot's own impact is animated. ReplayOverlay (catching up on turns the
 * viewer wasn't present for) always passes false, since it never showed the tick live. */
export function buildShotAnimation(
  players: PlayerState[],
  weaponName: string,
  resolution: TurnResolution,
  mySlot: 0 | 1,
  tickAlreadyShown: boolean,
): ShotAnimation {
  const slotByPlayerId = new Map(players.map((p) => [p.playerId, p.slot]));
  const offset =
    !tickAlreadyShown && (resolution.hazardDamage.length > 0 || resolution.burnDamage.length > 0)
      ? HAZARD_PHASE_TICKS
      : 0;
  const popups: DamagePopup[] = [];
  const captions: Caption[] = [];

  if (!tickAlreadyShown) {
    for (const entry of resolution.hazardDamage) {
      const slot = slotByPlayerId.get(entry.playerId);
      if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} damage from the hazard` : `${label} takes ${entry.amount} damage from the hazard` });
    }
    // Burn ticks read the same as a hazard tick — passive/DoT damage, not a direct hit — so
    // they share the same popup color and start-of-turn timing.
    for (const entry of resolution.burnDamage) {
      const slot = slotByPlayerId.get(entry.playerId);
      if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} burn damage` : `${label} takes ${entry.amount} burn damage` });
    }
    if (resolution.hazardTerrainDiff.length > 0) {
      captions.push({ triggerTick: 0, text: "The ground sinks beneath the hazard" });
    }
    for (const entry of resolution.statusExpired) {
      captions.push({ triggerTick: 0, text: statusExpiredCaption(players, entry, mySlot) });
    }
    for (const entry of resolution.statusInflicted) {
      if (entry.type !== "corroded") continue;
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick: 0, text: isMe ? `${label}'re corroded! Extra damage taken` : `${label} is corroded! Takes extra damage` });
    }
  }

  captions.push({ triggerTick: offset, text: `Firing ${weaponName}` });

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
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick, text: isMe ? `${label} take ${entry.amount} damage!` : `${label} takes ${entry.amount} damage!` });
    }
    for (const entry of resolution.statusInflicted) {
      if (entry.type === "corroded") continue; // corroded only ever comes from the pre-shot tick
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      const text =
        entry.type === "frozen"
          ? (isMe ? `${label}'re frozen!` : `${label} is frozen!`)
          : (isMe ? `${label}'re burning!` : `${label} is burning!`);
      captions.push({ triggerTick, text });
    }
    if (resolution.hazardZoneCreated) {
      captions.push({ triggerTick, text: "A hazard zone forms" });
    }
  }

  if (resolution.selfEffect?.type === "heal" && resolution.selfEffect.amount > 0) {
    const slot = slotByPlayerId.get(resolution.selfEffect.playerId);
    const firstProjectile = resolution.projectiles[0];
    const triggerTick = firstProjectile ? firstProjectile.startTick + offset + firstProjectile.tickCount : offset;
    if (slot !== undefined) {
      popups.push({ slot, amount: resolution.selfEffect.amount, triggerTick, source: "heal" });
    }
    const { label, isMe } = subject(players, resolution.selfEffect.playerId, mySlot);
    captions.push({ triggerTick, text: isMe ? `${label} heal ${resolution.selfEffect.amount} HP` : `${label} heals ${resolution.selfEffect.amount} HP` });
  } else if (resolution.selfEffect?.type === "shield") {
    const firstProjectile = resolution.projectiles[0];
    const triggerTick = firstProjectile ? firstProjectile.startTick + offset + firstProjectile.tickCount : offset;
    const { label, isMe } = subject(players, resolution.selfEffect.playerId, mySlot);
    captions.push({ triggerTick, text: isMe ? `${label} raise a shield` : `${label} raises a shield` });
  }

  return {
    projectiles,
    damagePopups: popups,
    hazardZoneCreated: resolution.hazardZoneCreated,
    selfEffect: resolution.selfEffect,
    statusInflicted: resolution.statusInflicted,
    captions,
    airstrikeFlight: resolution.airstrikeFlight
      ? { ...resolution.airstrikeFlight, startTick: offset }
      : null,
  };
}
