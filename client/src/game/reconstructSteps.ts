import type { GameDoc, HazardZone, PlayerState, Terrain, TurnDoc } from "@tancs/shared";

export interface Step {
  turn: TurnDoc;
  beforeTerrain: Terrain;
  afterTerrain: Terrain;
  beforePlayers: PlayerState[];
  afterPlayers: PlayerState[];
  beforeHazards: HazardZone[];
  afterHazards: HazardZone[];
}

/**
 * Rebuilds a before/after Step per turn from a batch of "unseen" turns, given the game's
 * CURRENT (i.e. after every turn in the batch) state as ground truth. Terrain/HP are
 * reconstructed backward (undo each turn's recorded diffs/damage, in reverse); hazard zones
 * and per-player shield/frozen status can't be backward-undone the same way (no "expired"
 * event is stored for zones, though shield/frozen do record one) so instead they're seeded by
 * un-ticking the known-current truth by `turns.length` for anything not (re-)created within
 * the batch, then forward-simulated turn by turn alongside terrain/HP.
 */
export function reconstructSteps(game: GameDoc, turns: TurnDoc[]): Step[] {
  const initialHeights = game.terrain.heights.slice();
  // Undo in reverse chronological order — both across turns and, within each turn, across
  // its projectiles — since overlapping craters (multiple fragments landing near each
  // other) make `oldHeight`/`newHeight` assignment order-sensitive, unlike a simple sum.
  // Within a turn, undo the shot's own terrainDiff first, then hazardTerrainDiff — the reverse
  // of combat.ts's actual order (hazard-zone sinking happens before the shot each turn).
  for (let i = turns.length - 1; i >= 0; i--) {
    const projectiles = turns[i].resolution.projectiles;
    for (let j = projectiles.length - 1; j >= 0; j--) {
      for (const d of projectiles[j].terrainDiff) {
        initialHeights[d.x] = d.oldHeight;
      }
    }
    for (const d of turns[i].resolution.hazardTerrainDiff) {
      initialHeights[d.x] = d.oldHeight;
    }
  }

  const initialHp: Record<string, number> = {};
  for (const p of game.players) initialHp[p.playerId] = p.hp;
  for (const turn of turns) {
    for (const d of turn.resolution.hazardDamage) {
      initialHp[d.playerId] = (initialHp[d.playerId] ?? 0) + d.amount;
    }
    for (const d of turn.resolution.burnDamage) {
      initialHp[d.playerId] = (initialHp[d.playerId] ?? 0) + d.amount;
    }
    for (const projectile of turn.resolution.projectiles) {
      for (const d of projectile.damage) {
        initialHp[d.playerId] = (initialHp[d.playerId] ?? 0) + d.amount;
      }
    }
    for (const f of turn.resolution.tankFalls) {
      initialHp[f.playerId] = (initialHp[f.playerId] ?? 0) + f.fallDamage;
    }
  }

  let heights = initialHeights;
  let hp: Record<string, number> = { ...initialHp };
  // Unlike terrain/HP, we can't backward-reconstruct hazard zones turn-by-turn (no "zone
  // expired" event is stored anywhere, only "zone created"), so instead we derive the correct
  // START of this batch from the one state we know is accurate: `game.hazards`, the current
  // live state (i.e. AFTER every turn in `turns` has applied). Any zone in that final state
  // that wasn't created by a turn in this batch must predate the batch — and since it survived
  // to the end, it was ticked exactly once per turn in the batch, so adding `turns.length` back
  // undoes that. (A pre-existing zone that fully expires *within* the batch can't be
  // recovered this way — an accepted limitation; it can't happen at all for a vs-CPU game's
  // batch, which is always exactly the CPU's one reply turn.)
  // A growing zone (e.g. Vat of Acid) is also wider now than it was `turns.length` ticks ago —
  // un-grow its bounds symmetrically, the same shape as the forward growth in combat.ts, so
  // early steps in the batch show it at its correct, narrower, earlier width.
  let zones: HazardZone[] = game.hazards
    .filter((z) => !turns.some((t) => t.resolution.hazardZoneCreated?.id === z.id))
    .map((z) => {
      const grown = (z.growPerTurn ?? 0) * turns.length;
      return {
        ...z,
        turnsRemaining: z.turnsRemaining + turns.length,
        startX: z.startX + grown / 2,
        endX: z.endX - grown / 2,
      };
    });

  // Same technique for per-player shield/frozen/burning: seed from the known-current truth
  // (`game.players`), un-ticking by `turns.length` for any player whose status wasn't
  // (re-)created within this batch — same accepted limitation as hazard zones.
  type ShieldState = PlayerState["shield"];
  type FrozenState = PlayerState["frozen"];
  type BurningState = PlayerState["burning"];
  type CorrodedState = PlayerState["corroded"];
  let shield: Record<string, ShieldState> = {};
  let frozen: Record<string, FrozenState> = {};
  let burning: Record<string, BurningState> = {};
  let corroded: Record<string, CorrodedState> = {};
  for (const p of game.players) {
    const shieldCreatedInBatch = turns.some(
      (t) => t.resolution.selfEffect?.type === "shield" && t.resolution.selfEffect.playerId === p.playerId,
    );
    shield[p.playerId] =
      p.shield && !shieldCreatedInBatch
        ? { ...p.shield, turnsRemaining: p.shield.turnsRemaining + turns.length }
        : null;

    const frozenCreatedInBatch = turns.some((t) =>
      t.resolution.statusInflicted.some((s) => s.type === "frozen" && s.playerId === p.playerId),
    );
    frozen[p.playerId] =
      p.frozen && !frozenCreatedInBatch
        ? { turnsRemaining: p.frozen.turnsRemaining + turns.length }
        : null;

    const burningCreatedInBatch = turns.some((t) =>
      t.resolution.statusInflicted.some((s) => s.type === "burning" && s.playerId === p.playerId),
    );
    burning[p.playerId] =
      p.burning && !burningCreatedInBatch
        ? { ...p.burning, turnsRemaining: p.burning.turnsRemaining + turns.length }
        : null;

    const corrodedCreatedInBatch = turns.some((t) =>
      t.resolution.statusInflicted.some((s) => s.type === "corroded" && s.playerId === p.playerId),
    );
    corroded[p.playerId] =
      p.corroded && !corrodedCreatedInBatch
        ? { ...p.corroded, turnsRemaining: p.corroded.turnsRemaining + turns.length }
        : null;
  }

  return turns.map((turn) => {
    const beforeTerrain: Terrain = { width: game.terrain.width, heights: heights.slice() };
    const beforeHazards = zones;
    const beforePlayers = game.players.map((p) => ({
      ...p,
      hp: hp[p.playerId],
      shield: shield[p.playerId] ?? null,
      frozen: frozen[p.playerId] ?? null,
      burning: burning[p.playerId] ?? null,
      corroded: corroded[p.playerId] ?? null,
    }));

    const newHeights = heights.slice();
    const newHp = { ...hp };
    // Hazard/burn ticks resolve before the fired shot each turn (see combat.ts) — apply in
    // that same order here, since DamageEntry.newHp is an absolute snapshot, not a delta, and
    // a same-turn double-hit would apply out of order otherwise. Hazard-zone sinking is part
    // of that same pre-shot tick, so it's applied before the shot's own terrainDiff too.
    for (const d of turn.resolution.hazardDamage) newHp[d.playerId] = d.newHp;
    for (const d of turn.resolution.burnDamage) newHp[d.playerId] = d.newHp;
    for (const d of turn.resolution.hazardTerrainDiff) newHeights[d.x] = d.newHeight;
    for (const projectile of turn.resolution.projectiles) {
      for (const d of projectile.terrainDiff) newHeights[d.x] = d.newHeight;
      for (const d of projectile.damage) newHp[d.playerId] = d.newHp;
    }
    for (const f of turn.resolution.tankFalls) {
      if (f.fallDamage > 0) {
        newHp[f.playerId] = Math.max(0, (newHp[f.playerId] ?? 0) - f.fallDamage);
      }
    }

    zones = zones
      .map((z) => {
        const grow = z.growPerTurn ?? 0;
        return {
          ...z,
          turnsRemaining: z.turnsRemaining - 1,
          startX: Math.max(0, z.startX - grow / 2),
          endX: Math.min(game.terrain.width - 1, z.endX + grow / 2),
        };
      })
      .filter((z) => z.turnsRemaining > 0);
    if (turn.resolution.hazardZoneCreated) zones = [...zones, turn.resolution.hazardZoneCreated];

    // Same tick rule combat.ts itself applies: decay first, then this turn's own cast/hit lands.
    const newShield: Record<string, ShieldState> = {};
    const newFrozen: Record<string, FrozenState> = {};
    const newBurning: Record<string, BurningState> = {};
    const newCorroded: Record<string, CorrodedState> = {};
    for (const p of game.players) {
      const s = shield[p.playerId];
      newShield[p.playerId] = s && s.turnsRemaining > 1 ? { ...s, turnsRemaining: s.turnsRemaining - 1 } : null;
      const f = frozen[p.playerId];
      newFrozen[p.playerId] = f && f.turnsRemaining > 1 ? { turnsRemaining: f.turnsRemaining - 1 } : null;
      const b = burning[p.playerId];
      newBurning[p.playerId] = b && b.turnsRemaining > 1 ? { ...b, turnsRemaining: b.turnsRemaining - 1 } : null;
      const c = corroded[p.playerId];
      newCorroded[p.playerId] = c && c.turnsRemaining > 1 ? { ...c, turnsRemaining: c.turnsRemaining - 1 } : null;
    }
    if (turn.resolution.selfEffect?.type === "shield") {
      newShield[turn.resolution.selfEffect.playerId] = {
        reduction: turn.resolution.selfEffect.reduction,
        turnsRemaining: turn.resolution.selfEffect.turns,
      };
    }
    for (const inflicted of turn.resolution.statusInflicted) {
      if (inflicted.type === "frozen") {
        newFrozen[inflicted.playerId] = { turnsRemaining: inflicted.turns };
      } else if (inflicted.type === "burning") {
        newBurning[inflicted.playerId] = { damagePerTurn: inflicted.damagePerTurn, turnsRemaining: inflicted.turns };
      } else {
        newCorroded[inflicted.playerId] = { amplify: inflicted.amplify, turnsRemaining: inflicted.turns };
      }
    }
    shield = newShield;
    frozen = newFrozen;
    burning = newBurning;
    corroded = newCorroded;

    const afterTerrain: Terrain = { width: game.terrain.width, heights: newHeights };
    const afterPlayers = game.players.map((p) => ({
      ...p,
      hp: newHp[p.playerId],
      shield: shield[p.playerId] ?? null,
      frozen: frozen[p.playerId] ?? null,
      burning: burning[p.playerId] ?? null,
      corroded: corroded[p.playerId] ?? null,
    }));

    heights = newHeights;
    hp = newHp;

    return { turn, beforeTerrain, afterTerrain, beforePlayers, afterPlayers, beforeHazards, afterHazards: zones };
  });
}
