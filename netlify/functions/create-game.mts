import { BOARD_WIDTH, createInitialTerrain, createPlayerState } from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { withDb } from "./_lib/db.js";
import type { GameRecord, PlayerLinkRecord, PlayerRecord } from "./_lib/models.js";
import { serializeGame } from "./_lib/models.js";
import { optionalString, parseJsonBody } from "./_lib/request.js";
import { errorResponse, json } from "./_lib/response.js";
import { generateToken } from "./_lib/token.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const displayName = optionalString(body, "displayName");

    return await withDb(async (db) => {
      const now = new Date();

      const playerResult = await db.collection<PlayerRecord>("players").insertOne({
        displayName,
        createdAt: now,
        authProvider: null,
        authSubjectId: null,
      });
      const playerId = playerResult.insertedId;

      const terrain = createInitialTerrain(BOARD_WIDTH);
      const player0 = createPlayerState(playerId.toHexString(), 0, terrain.width, displayName);
      const inviteToken = generateToken();

      const gameRecord: GameRecord = {
        mode: "single_battle",
        status: "waiting_for_player2",
        inviteToken,
        createdAt: now,
        updatedAt: now,
        version: 0,
        currentTurnPlayerIndex: 0,
        wind: 0,
        terrain,
        players: [player0],
        winnerPlayerId: null,
        turnCount: 0,
      };
      const gameResult = await db.collection<GameRecord>("games").insertOne(gameRecord);
      const gameId = gameResult.insertedId;

      const playerToken = generateToken();
      await db.collection<PlayerLinkRecord>("player_links").insertOne({
        token: playerToken,
        gameId,
        playerId,
        slot: 0,
        createdAt: now,
      });

      return json({
        gameId: gameId.toHexString(),
        playerToken,
        inviteToken,
        game: serializeGame({ ...gameRecord, _id: gameId }),
      });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
