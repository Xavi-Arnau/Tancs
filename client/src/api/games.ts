import type { GameDoc, GameSummary, TurnDoc } from "@tancs/shared";
import { apiGet, apiPost } from "./client";

export interface CreateGameResponse {
  gameId: string;
  playerToken: string;
  inviteToken: string;
  game: GameDoc;
}

export function createGame(displayName?: string, vsCpu?: boolean): Promise<CreateGameResponse> {
  return apiPost("create-game", { displayName, vsCpu });
}

export interface JoinGameResponse {
  gameId: string;
  playerToken: string;
  game: GameDoc;
}

export function joinGame(inviteToken: string, displayName?: string): Promise<JoinGameResponse> {
  return apiPost("join-game", { inviteToken, displayName });
}

export interface GetGameStateResponse {
  game: GameDoc;
  newTurns: TurnDoc[];
  latestTurnNumber: number;
}

export function getGameState(
  gameId: string,
  token: string,
  since: number,
): Promise<GetGameStateResponse> {
  return apiGet("get-game-state", { gameId, token, since });
}

export interface BuyWeaponsResponse {
  game: GameDoc;
}

export function buyWeapons(
  gameId: string,
  token: string,
  purchases: { weaponId: string; quantity: number }[],
): Promise<BuyWeaponsResponse> {
  return apiPost("buy-weapons", { gameId, token, purchases });
}

export interface SubmitTurnResponse {
  game: GameDoc;
  turn: TurnDoc;
}

export function submitTurn(
  gameId: string,
  token: string,
  weaponId: string,
  angle: number,
  power: number,
): Promise<SubmitTurnResponse> {
  return apiPost("submit-turn", { gameId, token, weaponId, angle, power });
}

export interface GameSummariesResponse {
  summaries: GameSummary[];
}

export function getGameSummaries(
  games: { gameId: string; token: string }[],
): Promise<GameSummariesResponse> {
  return apiPost("game-summaries", { games });
}
