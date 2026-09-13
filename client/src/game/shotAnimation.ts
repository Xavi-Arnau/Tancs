import type {
  HazardZone,
  PlayerState,
  StatusExpiredEntry,
  StatusInflictedEntry,
  TurnResolution,
  TurnStartTickResult,
  WeaponDefinition,
} from "@tancs/shared";
import type { ActiveShotProjectile, Caption, DamagePopup } from "./TerrainCanvas";

export type SoundCueKind =
  | "burnTick"
  | "hazardTick"
  | "hazardFormedLava"
  | "hazardFormedAcid"
  | "burningInflicted"
  | "corrodedInflicted"
  | "heartBloom"
  | "balloonLaunch"
  | "balloonLand";

export interface SoundCue {
  triggerTick: number;
  kind: SoundCueKind;
}

// If a turn includes hazard-tick damage, give it this many ticks on screen by itself before
// the fired shot starts flying — otherwise both appear to happen at once, making a lava tick
// look like it came from the shot itself. Only relevant to the "full" build (see buildShotAnimation's
// `tickAlreadyShown` param) — when the tick was already previewed separately, the shot starts
// immediately with no offset.
const HAZARD_PHASE_TICKS = 45;

// A Balloon's drift-flight duration scales with the distance traveled (same principle as Air
// Strike's plane pass, whose totalTicks derives from distance/speed) so a bigger drift visibly
// takes a bit longer to animate rather than snapping instantly to its landing spot.
const BALLOON_FLIGHT_BASE_TICKS = 40;
const BALLOON_FLIGHT_TICKS_PER_UNIT = 1.2;

export interface ShotAnimation {
  projectiles: ActiveShotProjectile[];
  damagePopups: DamagePopup[];
  hazardZoneCreated: HazardZone | null;
  selfEffect: TurnResolution["selfEffect"];
  statusInflicted: StatusInflictedEntry[];
  captions: Caption[];
  soundCues: SoundCue[];
  // Cosmetic full-map plane pass for an "airstrike" weapon — startTick already includes the
  // same pre-shot offset applied to every projectile's own startTick, so it stays in sync.
  airstrikeFlight: { fromLeft: boolean; totalTicks: number; startTick: number } | null;
  // Cosmetic mid-shot horizontal reposition for a "Balloon"-type self-effect — see TerrainCanvas's
  // ActiveShot.selfMove for how this drives rendering.
  selfMove: { playerId: string; fromX: number; toX: number; startTick: number; tickCount: number } | null;
}

export interface TickAnimation {
  damagePopups: DamagePopup[];
  statusInflicted: StatusInflictedEntry[];
  captions: Caption[];
  soundCues: SoundCue[];
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
  const soundCues: SoundCue[] = [];

  for (const entry of tick.hazardDamage) {
    const slot = players.find((p) => p.playerId === entry.playerId)?.slot;
    if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
    const { label, isMe } = subject(players, entry.playerId, mySlot);
    captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} damage from the hazard` : `${label} takes ${entry.amount} damage from the hazard` });
    soundCues.push({ triggerTick: 0, kind: "hazardTick" });
  }

  for (const entry of tick.burnDamage) {
    const slot = players.find((p) => p.playerId === entry.playerId)?.slot;
    if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
    const { label, isMe } = subject(players, entry.playerId, mySlot);
    captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} burn damage` : `${label} takes ${entry.amount} burn damage` });
    soundCues.push({ triggerTick: 0, kind: "burnTick" });
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
    soundCues.push({ triggerTick: 0, kind: "corrodedInflicted" });
  }

  return { damagePopups: popups, statusInflicted: tick.statusInflicted, captions, soundCues };
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
  weapon: WeaponDefinition,
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
  const soundCues: SoundCue[] = [];
  let selfMove: ShotAnimation["selfMove"] = null;

  if (!tickAlreadyShown) {
    for (const entry of resolution.hazardDamage) {
      const slot = slotByPlayerId.get(entry.playerId);
      if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} damage from the hazard` : `${label} takes ${entry.amount} damage from the hazard` });
      soundCues.push({ triggerTick: 0, kind: "hazardTick" });
    }
    // Burn ticks read the same as a hazard tick — passive/DoT damage, not a direct hit — so
    // they share the same popup color and start-of-turn timing.
    for (const entry of resolution.burnDamage) {
      const slot = slotByPlayerId.get(entry.playerId);
      if (slot !== undefined) popups.push({ slot, amount: entry.amount, triggerTick: 0, source: "hazard" });
      const { label, isMe } = subject(players, entry.playerId, mySlot);
      captions.push({ triggerTick: 0, text: isMe ? `${label} take ${entry.amount} burn damage` : `${label} takes ${entry.amount} burn damage` });
      soundCues.push({ triggerTick: 0, kind: "burnTick" });
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
      soundCues.push({ triggerTick: 0, kind: "corrodedInflicted" });
    }
  }

  captions.push({ triggerTick: offset, text: `Firing ${weapon.name}` });

  const projectiles: ActiveShotProjectile[] = resolution.projectiles.map((p) => ({
    trajectory: p.trajectory,
    tickCount: p.tickCount,
    startTick: p.startTick + offset,
    impact: p.impact,
    terrainDiff: p.terrainDiff,
  }));

  const burningCued = new Set<string>();
  let hazardZoneCued = false;
  const isLoveIsPain = weapon.id === "love_is_pain";
  let heartBloomCued = false;

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
      if (entry.type === "burning" && !burningCued.has(entry.playerId)) {
        burningCued.add(entry.playerId);
        soundCues.push({ triggerTick, kind: "burningInflicted" });
      }
    }
    if (resolution.hazardZoneCreated) {
      captions.push({ triggerTick, text: "A hazard zone forms" });
      if (!hazardZoneCued) {
        hazardZoneCued = true;
        const isAcid = Boolean(resolution.hazardZoneCreated.corrode || resolution.hazardZoneCreated.sinkPerTurn);
        soundCues.push({ triggerTick, kind: isAcid ? "hazardFormedAcid" : "hazardFormedLava" });
      }
    }
    if (isLoveIsPain && !heartBloomCued && projectile.impact) {
      // The carrier segment has impact === null (it splits mid-air); the first fragment after
      // it is where the heart pattern actually blooms into view.
      heartBloomCued = true;
      soundCues.push({ triggerTick: projectile.startTick + offset, kind: "heartBloom" });
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
  } else if (resolution.selfEffect?.type === "reposition") {
    const { playerId, fromX, toX } = resolution.selfEffect;
    const firstProjectile = resolution.projectiles[0];
    const startTick = firstProjectile ? firstProjectile.startTick + offset + firstProjectile.tickCount : offset;
    const distance = Math.abs(toX - fromX);
    const tickCount = Math.round(BALLOON_FLIGHT_BASE_TICKS + distance * BALLOON_FLIGHT_TICKS_PER_UNIT);
    selfMove = { playerId, fromX, toX, startTick, tickCount };
    soundCues.push({ triggerTick: startTick, kind: "balloonLaunch" });

    const { label, isMe } = subject(players, playerId, mySlot);
    captions.push({ triggerTick: startTick, text: isMe ? `${label} ride the wind` : `${label} rides the wind` });

    const landingTick = startTick + tickCount;
    soundCues.push({ triggerTick: landingTick, kind: "balloonLand" });
    const fall = resolution.tankFalls.find((f) => f.playerId === playerId);
    if (fall && fall.fallDamage > 0) {
      const slot = slotByPlayerId.get(playerId);
      if (slot !== undefined) popups.push({ slot, amount: fall.fallDamage, triggerTick: landingTick, source: "shot" });
      captions.push({
        triggerTick: landingTick,
        text: isMe ? `${label} take ${fall.fallDamage} fall damage landing` : `${label} takes ${fall.fallDamage} fall damage landing`,
      });
    } else {
      captions.push({ triggerTick: landingTick, text: isMe ? `${label} land safely` : `${label} lands safely` });
    }
  }

  return {
    projectiles,
    damagePopups: popups,
    hazardZoneCreated: resolution.hazardZoneCreated,
    selfEffect: resolution.selfEffect,
    statusInflicted: resolution.statusInflicted,
    captions,
    soundCues,
    airstrikeFlight: resolution.airstrikeFlight
      ? { ...resolution.airstrikeFlight, startTick: offset }
      : null,
    selfMove,
  };
}
