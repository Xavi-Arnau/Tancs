import type { GameSummary } from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { parseObjectId } from "./_lib/auth.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord, PlayerLinkRecord } from "./_lib/models.js";
import { parseJsonBody } from "./_lib/request.js";
import { errorResponse, HttpError, json } from "./_lib/response.js";

const MAX_GAMES = 100;

interface GameRequest {
  gameId: string;
  token: string;
}

function parseGames(raw: unknown): GameRequest[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "games must be an array");
  if (raw.length > MAX_GAMES) throw new HttpError(400, `Too many games (max ${MAX_GAMES})`);
  return raw.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as any).gameId !== "string" ||
      typeof (entry as any).token !== "string"
    ) {
      throw new HttpError(400, "Invalid game entry");
    }
    return entry as GameRequest;
  });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const requested = parseGames(body.games ?? []);

    if (requested.length === 0) {
      return json({ summaries: [] });
    }

    return await withDb(async (db) => {
      const tokens = requested.map((r) => r.token);
      const links = await db
        .collection<PlayerLinkRecord>("player_links")
        .find({ token: { $in: tokens } })
        .toArray();
      const linkByToken = new Map(links.map((l) => [l.token, l]));

      const gameIds = [...new Set(links.map((l) => l.gameId.toHexString()))];
      const games = await db
        .collection<GameRecord>("games")
        .find({ _id: { $in: gameIds.map((id) => parseObjectId(id, "gameId")) } })
        .toArray();
      const gameById = new Map(games.map((g) => [g._id.toHexString(), g]));

      const summaries: GameSummary[] = requested.map(({ gameId, token }) => {
        const link = linkByToken.get(token);
        if (!link || link.gameId.toHexString() !== gameId) {
          return { gameId, ok: false };
        }
        const game = gameById.get(gameId);
        if (!game) return { gameId, ok: false };

        const mySlot = link.slot;
        const opponentSlot: 0 | 1 = mySlot === 0 ? 1 : 0;
        const me = game.players[mySlot];
        const opponent = game.players[opponentSlot];
        if (!me) return { gameId, ok: false };

        let isMyTurn = false;
        if (game.status === "buy_phase") isMyTurn = !me.readyForBuyPhase;
        else if (game.status === "battle_phase") isMyTurn = game.currentTurnPlayerIndex === mySlot;

        let winnerIsMe: boolean | null = null;
        if (game.status === "game_over" && game.winnerPlayerId !== null) {
          winnerIsMe = game.winnerPlayerId === me.playerId;
        }

        return {
          gameId,
          ok: true,
          status: game.status,
          createdAt: game.createdAt.toISOString(),
          latestTurnNumber: game.turnCount,
          mySlot,
          myDisplayName: me.displayName,
          opponentDisplayName: opponent?.displayName ?? null,
          myHp: me.hp,
          opponentHp: opponent?.hp ?? null,
          isMyTurn,
          winnerIsMe,
        };
      });

      return json({ summaries });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
