import type { ObjectId, WithId } from "mongodb";
import type {
  GameDoc,
  GameMode,
  GameStatus,
  PlayerState,
  Terrain,
  TurnAction,
  TurnDoc,
  TurnResolution,
} from "@tancs/shared";

// Mongo-facing document shapes (ObjectId/Date instead of the string/ISO shapes shared/
// types use — those are what gets sent to clients, via the serialize* functions below).
// _id is deliberately omitted here (rather than typed as ObjectId) so the mongodb driver's
// insertOne() infers it as auto-generated; reads come back typed as WithId<T> instead.

export interface PlayerRecord {
  displayName: string | null;
  createdAt: Date;
  authProvider: null;
  authSubjectId: null;
}

export interface PlayerLinkRecord {
  token: string;
  gameId: ObjectId;
  playerId: ObjectId;
  slot: 0 | 1;
  createdAt: Date;
}

export interface GameRecord {
  mode: GameMode;
  status: GameStatus;
  inviteToken: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  currentTurnPlayerIndex: 0 | 1;
  wind: number;
  terrain: Terrain;
  players: PlayerState[];
  winnerPlayerId: string | null;
  turnCount: number;
}

export interface TurnRecord {
  gameId: ObjectId;
  round: number;
  turnNumber: number;
  actingPlayerId: string;
  actingSlot: 0 | 1;
  action: TurnAction;
  resolution: TurnResolution;
  createdAt: Date;
}

export function serializeGame(doc: WithId<GameRecord>): GameDoc {
  return {
    _id: doc._id.toHexString(),
    mode: doc.mode,
    status: doc.status,
    inviteToken: doc.inviteToken,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    version: doc.version,
    currentTurnPlayerIndex: doc.currentTurnPlayerIndex,
    wind: doc.wind,
    terrain: doc.terrain,
    players: doc.players,
    winnerPlayerId: doc.winnerPlayerId,
  };
}

export function serializeTurn(doc: WithId<TurnRecord>): TurnDoc {
  return {
    _id: doc._id.toHexString(),
    gameId: doc.gameId.toHexString(),
    round: doc.round,
    turnNumber: doc.turnNumber,
    actingPlayerId: doc.actingPlayerId,
    actingSlot: doc.actingSlot,
    action: doc.action,
    resolution: doc.resolution,
    createdAt: doc.createdAt.toISOString(),
  };
}
