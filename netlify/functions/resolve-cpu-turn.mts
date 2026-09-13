import type { Context } from "@netlify/functions";
import { requireAuth } from "./_lib/auth.js";
import { resolveCpuTurn } from "./_lib/cpuTurn.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord, TurnRecord } from "./_lib/models.js";
import { serializeGame } from "./_lib/models.js";
import { parseJsonBody, requireString } from "./_lib/request.js";
import { errorResponse, json } from "./_lib/response.js";

/**
 * Plays the CPU's own turn, as its own independent write — the same shape of action a second
 * human would take by simply submitting their move. Called by the client whenever it notices
 * it's the CPU's turn (see GameView.tsx), not chained into the human's own submit-turn request:
 * that used to be baked into the same write as the human's turn (there being no background/cron
 * infrastructure to do it later), which meant the CPU's outcome could already be sitting in the
 * database — and get revealed by a routine background poll — before the human's own turn had
 * even finished animating. Giving vs-CPU games a real intermediate "I moved, CPU hasn't replied
 * yet" state (which PvP already has for free, since each player's turn is its own write) removes
 * that whole class of bug instead of chasing each symptom separately.
 *
 * Safe to call redundantly/concurrently: if the game has moved on (someone else's call already
 * resolved it, or it's no longer actually the CPU's turn) by the time of the atomic write below,
 * that's treated as a no-op, not an error — the caller just gets back whatever the current state
 * actually is.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const gameId = requireString(body, "gameId");
    const token = requireString(body, "token");

    return await withDb(async (db) => {
      // Not slot-specific — this isn't acting "as" a particular human, just triggering the
      // CPU's own move — but still requires a valid token for this game, same trust boundary
      // as reading game state.
      const auth = await requireAuth(db, token, gameId);

      const game = await db.collection<GameRecord>("games").findOne({ _id: auth.gameId });
      if (!game) return json({ game: null });

      if (
        game.mode !== "vs_cpu" ||
        game.status !== "battle_phase" ||
        game.currentTurnPlayerIndex !== 1
      ) {
        // Nothing to do — either it's not this game's CPU's turn, or someone else already
        // resolved it. Not an error: just hand back the current state.
        return json({ game: serializeGame(game) });
      }

      const cpuTurnNumber = game.turnCount + 1;
      const cpu = resolveCpuTurn({
        terrain: game.terrain,
        players: game.players,
        hazards: game.hazards ?? [],
        wind: game.wind,
        turnNumber: cpuTurnNumber,
      });
      const updated = await db.collection<GameRecord>("games").findOneAndUpdate(
        {
          _id: game._id,
          status: "battle_phase",
          currentTurnPlayerIndex: 1,
          version: game.version,
        },
        {
          $set: {
            terrain: cpu.terrain,
            players: cpu.players,
            hazards: cpu.hazards,
            status: cpu.status,
            currentTurnPlayerIndex: cpu.currentTurnPlayerIndex,
            wind: cpu.wind,
            winnerPlayerId: cpu.winnerPlayerId,
            updatedAt: new Date(),
            turnCount: cpuTurnNumber,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        // Someone else's concurrent call already resolved this turn (or the state changed
        // out from under us) — re-read and hand back whatever's actually there now.
        const fresh = await db.collection<GameRecord>("games").findOne({ _id: game._id });
        return json({ game: fresh ? serializeGame(fresh) : null });
      }

      const cpuTurnRecord: TurnRecord = {
        gameId: game._id,
        round: 1,
        turnNumber: cpuTurnNumber,
        actingPlayerId: cpu.players[1].playerId,
        actingSlot: 1,
        action: cpu.action,
        resolution: cpu.resolution,
        createdAt: new Date(),
      };
      await db.collection<TurnRecord>("turns").insertOne(cpuTurnRecord);

      return json({ game: serializeGame(updated) });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
