import type { Context } from "@netlify/functions";
import { parseObjectId, requireAuth } from "./_lib/auth.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord, TurnRecord } from "./_lib/models.js";
import { serializeGame, serializeTurn } from "./_lib/models.js";
import { errorResponse, HttpError, json } from "./_lib/response.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const gameIdParam = url.searchParams.get("gameId");
    const token = url.searchParams.get("token");
    const since = Number(url.searchParams.get("since") ?? "0");

    if (!gameIdParam) throw new HttpError(400, "Missing gameId");

    return await withDb(async (db) => {
      await requireAuth(db, token, gameIdParam);

      const gameId = parseObjectId(gameIdParam, "gameId");
      const game = await db.collection<GameRecord>("games").findOne({ _id: gameId });
      if (!game) throw new HttpError(404, "Game not found");

      const newTurns = Number.isFinite(since) && since < game.turnCount
        ? await db
            .collection<TurnRecord>("turns")
            .find({ gameId, turnNumber: { $gt: since } })
            .sort({ turnNumber: 1 })
            .toArray()
        : [];

      return json({
        game: serializeGame(game),
        newTurns: newTurns.map(serializeTurn),
        latestTurnNumber: game.turnCount,
      });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
