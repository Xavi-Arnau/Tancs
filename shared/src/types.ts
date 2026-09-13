export type ProjectileType = "parabolic" | "split" | "bounce" | "instant" | "airstrike";

export interface SplitPatternPoint {
  dx: number; // target offset from the split point, board units
  dy: number;
}

export interface WeaponDefinition {
  id: string;
  name: string;
  description: string;
  cost: number; // currency cost per unit in the buy phase; 0 for the free weapon
  damage: number; // base damage at the center of the splash radius (per fragment, for "split")
  splashRadius: number; // board units (per fragment, for "split")
  projectile: ProjectileType;
  defaultAmmo: number | "infinite";
  purchasable: boolean; // whether it can be bought in the buy phase
  color: string; // hex color, used client-side to identify this weapon at a glance
  icon: string; // string key resolved to an actual icon component client-side
  // Only meaningful when projectile === "split":
  splitPattern?: SplitPatternPoint[]; // one fragment per point, in this exact order
  splitRevealTicks?: number; // ticks after the split when the pattern should be fully "revealed" (ignored by "drop" mode)
  splitMode?: "trajectory" | "drop"; // "trajectory" (default): solve a velocity to reach the pattern point, then keep flying. "drop": spawn directly at the pattern point at rest and fall straight down (wind ignored), so the whole pattern stays rigid while falling.
  projectileStyle?: "flame" | "bomb" | "balloon"; // client rendering hint for this weapon's projectiles; defaults to a plain shell look
  // Tint for the projectile's dot+trail while in flight (non-flame styles only); defaults to
  // the standard dark shell color when unset — opt-in per weapon, not applied automatically:
  projectileColor?: string;
  // Only meaningful when projectile === "bounce":
  maxBounces?: number; // how many times it skips off terrain before its final, real impact
  // Persistent hazard this weapon leaves behind at its impact point, ticking damage each
  // subsequent turn until it expires (see HazardZone). growPerTurn (optional) widens the
  // zone's startX/endX a little further each tick, for a pool that spreads over its lifetime.
  // sinkPerTurn (optional) lowers the terrain under the zone a little further each tick, for a
  // pool that eats into the ground instead of (or as well as) spreading sideways. corrode
  // (optional) inflicts a stacking-refresh vulnerability status (see PlayerState.corroded) on
  // whoever the zone damages on its tick:
  hazard?: {
    damagePerTurn: number;
    turns: number;
    growPerTurn?: number;
    sinkPerTurn?: number;
    corrode?: { amplify: number; turns: number };
  };
  // Self-cast utility effects (only meaningful when projectile === "instant" — no real
  // flight, applied directly to the caster regardless of aim):
  heal?: number; // flat HP restored to the caster, capped at STARTING_HP
  shield?: { reduction: number; turns: number }; // reduction is a 0-1 fraction of incoming damage negated
  // Lifts the caster's own tank and drifts it horizontally with the wind before landing (see
  // BALLOON_MIN_DRIFT/BALLOON_WIND_DRIFT_SCALE in constants.ts and resolveShot's dedicated
  // branch) — carries no damage/splash of its own:
  balloon?: true;
  // Inflicted on any opposing player caught in this weapon's splash — locks their aim angle
  // to whatever they last fired at (power and firing are unaffected) for `turns` game-turns:
  freeze?: { turns: number };
  // Inflicted on ANY player caught in this weapon's splash (including the caster, unlike
  // freeze) — a low-damage-per-turn burn that ticks on the burning player's own turns only,
  // same reasoning as terrain hazard zones:
  burn?: { damagePerTurn: number; turns: number };
}

export interface Point {
  x: number;
  y: number;
}

export interface InventoryEntry {
  weaponId: string;
  quantity: number; // ignored (never decremented) for "infinite" ammo weapons
}

export type GameMode = "single_battle" | "vs_cpu";

export type GameStatus =
  | "waiting_for_player2"
  | "buy_phase"
  | "battle_phase"
  | "game_over";

export interface PlayerState {
  playerId: string;
  slot: 0 | 1;
  tankX: number;
  hp: number;
  currency: number;
  readyForBuyPhase: boolean;
  inventory: InventoryEntry[];
  lastAngle: number; // last angle this tank fired at (or its initial facing), for rendering
  displayName: string | null;
  shield: { reduction: number; turnsRemaining: number } | null;
  frozen: { turnsRemaining: number } | null; // aim angle locked to lastAngle while active
  burning: { damagePerTurn: number; turnsRemaining: number } | null;
  // Vulnerability inflicted by standing in a corrosive hazard zone (Vat of Acid) — amplifies
  // ALL incoming damage by this fraction while active (see applyDamage in combat.ts):
  corroded: { amplify: number; turnsRemaining: number } | null;
  // Chosen during buy phase (see TANK_CLASSES in tankClasses.ts) — affects this player's own
  // max HP and outgoing splash damage. Defaults to "standard" (no bonuses/drawbacks) until
  // buy-weapons.mts sets it from the player's actual pick.
  tankClass: string;
}

export interface Terrain {
  width: number;
  heights: number[];
}

// A persistent, multi-turn hazard (e.g. Magma Strike's lava pool) — any tank whose column
// falls within [startX, endX] takes damagePerTurn every turn until turnsRemaining hits 0.
// A freshly created zone is NOT ticked the turn it's created (see combat.ts). growPerTurn
// (e.g. Vat of Acid), if set, widens startX/endX a little further on every subsequent tick.
export interface HazardZone {
  id: string;
  startX: number;
  endX: number;
  damagePerTurn: number;
  turnsRemaining: number;
  growPerTurn?: number;
  sinkPerTurn?: number; // widens the zone's depth into the ground instead of (or alongside) its width
  corrode?: { amplify: number; turns: number }; // inflicted on whoever the zone damages each tick
  color?: string; // hex, from the creating weapon's own `color` — lets the pool render distinctly per weapon
}

export interface GameDoc {
  _id: string;
  mode: GameMode;
  status: GameStatus;
  inviteToken: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  currentTurnPlayerIndex: 0 | 1;
  wind: number;
  terrain: Terrain;
  players: PlayerState[]; // length 1 while waiting_for_player2, length 2 otherwise
  winnerPlayerId: string | null;
  hazards: HazardZone[];
}

export interface TerrainDiffEntry {
  x: number;
  oldHeight: number;
  newHeight: number;
}

export interface DamageEntry {
  playerId: string;
  amount: number;
  newHp: number;
}

export interface TankFallEntry {
  playerId: string;
  fromY: number;
  toY: number;
  fallDamage: number;
}

export interface TurnAction {
  weaponId: string;
  angle: number; // degrees, 0 = flat toward +x, 90 = straight up, 180 = flat toward -x
  power: number; // 0-100
}

export interface ProjectileEvent {
  trajectory: Point[]; // sampled points, for animation
  tickCount: number; // real (pre-sample) simulated tick length — drives animation duration
  startTick: number; // ticks elapsed in the turn before this segment starts animating
  impact: Point | null; // null if this segment left the board, or (for a split's carrier) doesn't land at all
  terrainDiff: TerrainDiffEntry[];
  damage: DamageEntry[];
}

export type SelfEffectEntry =
  | { playerId: string; type: "heal"; amount: number }
  | { playerId: string; type: "shield"; reduction: number; turns: number }
  | { playerId: string; type: "reposition"; fromX: number; toX: number };

export type StatusInflictedEntry =
  | { playerId: string; type: "frozen"; turns: number }
  | { playerId: string; type: "burning"; damagePerTurn: number; turns: number }
  | { playerId: string; type: "corroded"; amplify: number; turns: number };

export interface StatusExpiredEntry {
  playerId: string;
  type: "shield" | "frozen" | "burning" | "corroded";
  priorTurnsRemaining: number; // what it was right before this turn's decrement — lets replay recover it
}

export interface TurnResolution {
  wind: number;
  // One element for a normal single-shell weapon; for a "split" weapon, the carrier segment
  // (impact always null — it splits mid-air instead of landing) followed by one entry per
  // fragment. Order matters: it's the true server-side carve order, relied on when replaying.
  projectiles: ProjectileEvent[];
  tankFalls: TankFallEntry[];
  // Damage from hazard zones that existed BEFORE this turn, ticked at its start (before the
  // fired shot resolves) — independent of any projectile, since it isn't tied to an impact.
  hazardDamage: DamageEntry[];
  // Terrain changes from hazard zones sinking (HazardZone.sinkPerTurn) at the same point in
  // the turn as hazardDamage — independent of any projectile's own terrainDiff.
  hazardTerrainDiff: TerrainDiffEntry[];
  // The zone (if any) this turn's fired shot spawned — null if the weapon has no `hazard`
  // config or its shot didn't impact. Not yet ticked; that starts next turn.
  hazardZoneCreated: HazardZone | null;
  // Damage from the acting player's own `burning` status ticking, same timing as hazardDamage
  // (start of turn) but tied to the player rather than a terrain position.
  burnDamage: DamageEntry[];
  // This turn's own self-cast heal/shield (weapon.heal / weapon.shield), if any.
  selfEffect: SelfEffectEntry | null;
  // Freeze/burn effects this turn's shot inflicted on whoever it splashed.
  statusInflicted: StatusInflictedEntry[];
  // Shield/frozen/burning statuses that existed BEFORE this turn and expired from this turn's tick.
  statusExpired: StatusExpiredEntry[];
  // Set only when this turn's weapon is an "airstrike" — purely cosmetic metadata for the
  // plane's full-map pass, independent of any individual bomb's own trajectory/timing.
  airstrikeFlight: { fromLeft: boolean; totalTicks: number } | null;
  resultingGameStatus: GameStatus;
}

export function turnHadAnyImpact(resolution: TurnResolution): boolean {
  return resolution.projectiles.some((p) => p.impact !== null);
}

export interface GameSummaryOk {
  gameId: string;
  ok: true;
  status: GameStatus;
  createdAt: string;
  latestTurnNumber: number;
  mySlot: 0 | 1;
  myDisplayName: string | null;
  opponentDisplayName: string | null;
  myHp: number;
  opponentHp: number | null; // null if the opponent hasn't joined yet
  isMyTurn: boolean;
  winnerIsMe: boolean | null; // true win, false loss, null draw/not-over-yet
}

export interface GameSummaryUnavailable {
  gameId: string;
  ok: false;
}

export type GameSummary = GameSummaryOk | GameSummaryUnavailable;

export interface TurnDoc {
  _id: string;
  gameId: string;
  round: number;
  turnNumber: number;
  actingPlayerId: string;
  actingSlot: 0 | 1;
  action: TurnAction;
  resolution: TurnResolution;
  createdAt: string;
}
