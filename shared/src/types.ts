export type ProjectileType = "parabolic";

export interface WeaponDefinition {
  id: string;
  name: string;
  description: string;
  cost: number; // currency cost per unit in the buy phase; 0 for the free weapon
  damage: number; // base damage at the center of the splash radius
  splashRadius: number; // board units
  projectile: ProjectileType;
  defaultAmmo: number | "infinite";
  purchasable: boolean; // whether it can be bought in the buy phase
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

export interface TurnResolution {
  wind: number;
  impact: Point | null; // null if the projectile left the board without hitting terrain
  trajectory: Point[];
  terrainDiff: TerrainDiffEntry[];
  damage: DamageEntry[];
  tankFalls: TankFallEntry[];
  resultingGameStatus: GameStatus;
}

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
