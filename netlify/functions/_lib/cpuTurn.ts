import {
  decideCpuAction,
  resolveShot,
  WIND_MAX,
  type GameStatus,
  type HazardZone,
  type PlayerState,
  type Terrain,
  type TurnAction,
  type TurnResolution,
} from "@tancs/shared";

export interface ResolveCpuTurnParams {
  terrain: Terrain;
  players: PlayerState[];
  hazards: HazardZone[];
  wind: number;
  turnNumber: number;
}

export interface ResolveCpuTurnResult {
  terrain: Terrain;
  players: PlayerState[];
  hazards: HazardZone[];
  wind: number;
  status: GameStatus;
  winnerPlayerId: string | null;
  currentTurnPlayerIndex: 0 | 1;
  action: TurnAction;
  resolution: TurnResolution;
}

/**
 * Resolves the CPU's (always slot 1) turn inline — there's no background/cron infrastructure
 * in this app, so whichever request makes it the CPU's turn must play that turn synchronously,
 * right there, before responding. Shared by buy-weapons.mts (when the CPU is randomly chosen
 * to go first) and submit-turn.mts (after the human's own shot hands the turn to the CPU).
 */
export function resolveCpuTurn(params: ResolveCpuTurnParams): ResolveCpuTurnResult {
  const action = decideCpuAction({
    terrain: params.terrain,
    players: params.players,
    wind: params.wind,
    cpuSlot: 1,
  });

  const result = resolveShot({
    terrain: params.terrain,
    players: params.players,
    wind: params.wind,
    actingSlot: 1,
    action,
    hazards: params.hazards,
    turnNumber: params.turnNumber,
  });
  result.players[1].lastAngle = action.angle;

  const currentTurnPlayerIndex: 0 | 1 =
    result.resolution.resultingGameStatus === "game_over" ? 1 : 0;
  const wind = Math.round((Math.random() * 2 - 1) * WIND_MAX);

  return {
    terrain: result.terrain,
    players: result.players,
    hazards: result.hazards,
    wind,
    status: result.resolution.resultingGameStatus,
    winnerPlayerId: result.winnerPlayerId,
    currentTurnPlayerIndex,
    action,
    resolution: result.resolution,
  };
}
