export type ProjectileType = "parabolic" | "split";

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
  projectileStyle?: "flame"; // client rendering hint for this weapon's projectiles; defaults to a plain shell look
}

export interface Point {
  x: number;
  y: number;
}

export interface InventoryEntry {
  weaponId: string;
  quantity: number; // ignored (never decremented) for "infinite" ammo weapons
}

export type GameMode = "single_battle";

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
}

export interface Terrain {
  width: number;
  heights: number[];
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

export interface TurnResolution {
  wind: number;
  // One element for a normal single-shell weapon; for a "split" weapon, the carrier segment
  // (impact always null — it splits mid-air instead of landing) followed by one entry per
  // fragment. Order matters: it's the true server-side carve order, relied on when replaying.
  projectiles: ProjectileEvent[];
  tankFalls: TankFallEntry[];
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
