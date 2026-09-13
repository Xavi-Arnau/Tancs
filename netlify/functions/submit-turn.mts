import {
  getWeapon,
  MAX_ANGLE,
  MAX_POWER,
  MIN_ANGLE,
  MIN_POWER,
  resolveEffectiveAngle,
  resolveShot,
  WIND_MAX,
} from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { requireAuth } from "./_lib/auth.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord, TurnRecord } from "./_lib/models.js";
import { serializeGame, serializeTurn } from "./_lib/models.js";
import { parseJsonBody, requireString } from "./_lib/request.js";
import { errorResponse, HttpError, json } from "./_lib/response.js";

function requireNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `Missing or invalid field: ${key}`);
  }
  return value;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const gameId = requireString(body, "gameId");
    const token = requireString(body, "token");
    const weaponId = requireString(body, "weaponId");
    const angle = requireNumber(body, "angle");
    const power = requireNumber(body, "power");

    if (angle < MIN_ANGLE || angle > MAX_ANGLE) {
      throw new HttpError(400, `angle must be between ${MIN_ANGLE} and ${MAX_ANGLE}`);
    }
    if (power < MIN_POWER || power > MAX_POWER) {
      throw new HttpError(400, `power must be between ${MIN_POWER} and ${MAX_POWER}`);
    }

    const weapon = getWeapon(weaponId); // throws if unknown weaponId

    return await withDb(async (db) => {
      const auth = await requireAuth(db, token, gameId);
      const game = await db.collection<GameRecord>("games").findOne({ _id: auth.gameId });
      if (!game) throw new HttpError(404, "Game not found");
      if (game.status !== "battle_phase") {
        throw new HttpError(409, "Game is not in the battle phase");
      }
      if (game.currentTurnPlayerIndex !== auth.slot) {
        throw new HttpError(409, "It is not your turn");
      }

      const player = game.players[auth.slot];
      if (weapon.defaultAmmo !== "infinite") {
        const entry = player.inventory.find((e) => e.weaponId === weapon.id);
        if (!entry || entry.quantity <= 0) {
          throw new HttpError(400, `No ammo remaining for weapon: ${weapon.id}`);
        }
      }

      const newTurnNumber = game.turnCount + 1;
      // Frozen players are forced to keep firing at their last angle, regardless of what the
      // client requested (a stale/frozen client might still send a different one) — this is
      // the authoritative source of truth for what actually fires and what gets persisted.
      const effectiveAngle = resolveEffectiveAngle(player, angle);

      const result = resolveShot({
        terrain: game.terrain,
        players: game.players,
        wind: game.wind,
        actingSlot: auth.slot,
        action: { weaponId, angle: effectiveAngle, power },
        hazards: game.hazards ?? [],
        turnNumber: newTurnNumber,
      });
      result.players[auth.slot].lastAngle = effectiveAngle;

      const nextTurnPlayerIndex: 0 | 1 =
        result.resolution.resultingGameStatus === "game_over"
          ? game.currentTurnPlayerIndex
          : auth.slot === 0
            ? 1
            : 0;
      const nextWind = Math.round((Math.random() * 2 - 1) * WIND_MAX);
      const now = new Date();

      const updated = await db.collection<GameRecord>("games").findOneAndUpdate(
        {
          _id: game._id,
          status: "battle_phase",
          currentTurnPlayerIndex: auth.slot,
          version: game.version,
        },
        {
          $set: {
            terrain: result.terrain,
            players: result.players,
            hazards: result.hazards,
            status: result.resolution.resultingGameStatus,
            currentTurnPlayerIndex: nextTurnPlayerIndex,
            wind: nextWind,
            winnerPlayerId: result.winnerPlayerId,
            updatedAt: now,
            turnCount: newTurnNumber,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        throw new HttpError(409, "Game state changed, please retry");
      }

      const turnRecord: TurnRecord = {
        gameId: game._id,
        round: 1,
        turnNumber: newTurnNumber,
        actingPlayerId: auth.playerIdStr,
        actingSlot: auth.slot,
        action: { weaponId, angle: effectiveAngle, power },
        resolution: result.resolution,
        createdAt: now,
      };

      const insertResult = await db.collection<TurnRecord>("turns").insertOne(turnRecord);

      return json({
        game: serializeGame(updated),
        turn: serializeTurn({ ...turnRecord, _id: insertResult.insertedId }),
      });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
