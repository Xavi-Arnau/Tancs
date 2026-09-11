import { createPlayerState } from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { withDb } from "./_lib/db.js";
import type { GameRecord, PlayerLinkRecord, PlayerRecord } from "./_lib/models.js";
import { serializeGame } from "./_lib/models.js";
import { optionalString, parseJsonBody, requireString } from "./_lib/request.js";
import { errorResponse, HttpError, json } from "./_lib/response.js";
import { generateToken } from "./_lib/token.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const inviteToken = requireString(body, "inviteToken");
    const displayName = optionalString(body, "displayName");

    return await withDb(async (db) => {
      const now = new Date();

      const game = await db
        .collection<GameRecord>("games")
        .findOne({ inviteToken });
      if (!game) throw new HttpError(404, "Game not found");
      if (game.status !== "waiting_for_player2") {
        throw new HttpError(409, "This game already has two players");
      }

      const playerResult = await db.collection<PlayerRecord>("players").insertOne({
        displayName,
        createdAt: now,
        authProvider: null,
        authSubjectId: null,
      });
      const playerId = playerResult.insertedId;
      const player1 = createPlayerState(
        playerId.toHexString(),
        1,
        game.terrain.width,
        displayName,
      );

      const updated = await db.collection<GameRecord>("games").findOneAndUpdate(
        { _id: game._id, status: "waiting_for_player2", version: game.version },
        {
          $set: {
            status: "buy_phase",
            players: [game.players[0], player1],
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        throw new HttpError(409, "Game state changed, please retry");
      }

      const playerToken = generateToken();
      await db.collection<PlayerLinkRecord>("player_links").insertOne({
        token: playerToken,
        gameId: game._id,
        playerId,
        slot: 1,
        createdAt: now,
      });

      return json({
        gameId: game._id.toHexString(),
        playerToken,
        game: serializeGame(updated),
      });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
