import { getWeapon, WIND_MAX } from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { requireAuth } from "./_lib/auth.js";
import { resolveCpuTurn } from "./_lib/cpuTurn.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord, TurnRecord } from "./_lib/models.js";
import { serializeGame } from "./_lib/models.js";
import { parseJsonBody, requireString } from "./_lib/request.js";
import { errorResponse, HttpError, json } from "./_lib/response.js";

interface PurchaseInput {
  weaponId: string;
  quantity: number;
}

function parsePurchases(raw: unknown): PurchaseInput[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "purchases must be an array");
  return raw.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as any).weaponId !== "string" ||
      typeof (entry as any).quantity !== "number" ||
      !Number.isInteger((entry as any).quantity) ||
      (entry as any).quantity < 0
    ) {
      throw new HttpError(400, "Invalid purchase entry");
    }
    return entry as PurchaseInput;
  });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  try {
    const body = await parseJsonBody(req);
    const gameId = requireString(body, "gameId");
    const token = requireString(body, "token");
    const purchases = parsePurchases(body.purchases ?? []);

    return await withDb(async (db) => {
      const auth = await requireAuth(db, token, gameId);
      const game = await db.collection<GameRecord>("games").findOne({ _id: auth.gameId });
      if (!game) throw new HttpError(404, "Game not found");
      if (game.status !== "buy_phase") {
        throw new HttpError(409, "Game is not in the buy phase");
      }

      const player = game.players[auth.slot];
      if (!player) throw new HttpError(404, "Player not found in this game");
      if (player.readyForBuyPhase) {
        throw new HttpError(409, "Purchases already submitted for this game");
      }

      let totalCost = 0;
      const inventory = player.inventory.map((entry) => ({ ...entry }));
      for (const purchase of purchases) {
        const weapon = getWeapon(purchase.weaponId);
        if (!weapon.purchasable) {
          throw new HttpError(400, `Weapon is not purchasable: ${weapon.id}`);
        }
        totalCost += weapon.cost * purchase.quantity;
        const entry = inventory.find((e) => e.weaponId === weapon.id);
        if (entry) {
          entry.quantity += purchase.quantity;
        } else {
          inventory.push({ weaponId: weapon.id, quantity: purchase.quantity });
        }
      }

      if (totalCost > player.currency) {
        throw new HttpError(400, "Insufficient currency for these purchases");
      }

      const now = new Date();
      const playersPath = `players.${auth.slot}`;
      const updated = await db.collection<GameRecord>("games").findOneAndUpdate(
        {
          _id: game._id,
          status: "buy_phase",
          version: game.version,
          [`${playersPath}.readyForBuyPhase`]: false,
        },
        {
          $set: {
            [`${playersPath}.currency`]: player.currency - totalCost,
            [`${playersPath}.inventory`]: inventory,
            [`${playersPath}.readyForBuyPhase`]: true,
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        throw new HttpError(409, "Game state changed, please retry");
      }

      let finalDoc = updated;
      if (finalDoc.players.every((p) => p.readyForBuyPhase)) {
        const startingPlayer: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        const wind = Math.round((Math.random() * 2 - 1) * WIND_MAX);
        const flipped = await db.collection<GameRecord>("games").findOneAndUpdate(
          { _id: game._id, status: "buy_phase", version: finalDoc.version },
          {
            $set: {
              status: "battle_phase",
              currentTurnPlayerIndex: startingPlayer,
              wind,
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { returnDocument: "after" },
        );
        if (flipped) {
          finalDoc = flipped;

          if (finalDoc.mode === "vs_cpu" && finalDoc.currentTurnPlayerIndex === 1) {
            const cpuTurnNumber = finalDoc.turnCount + 1;
            const cpu = resolveCpuTurn({
              terrain: finalDoc.terrain,
              players: finalDoc.players,
              hazards: finalDoc.hazards ?? [],
              wind: finalDoc.wind,
              turnNumber: cpuTurnNumber,
            });

            const afterCpu = await db.collection<GameRecord>("games").findOneAndUpdate(
              { _id: game._id, status: "battle_phase", version: finalDoc.version },
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

            if (afterCpu) {
              finalDoc = afterCpu;
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
            }
          }
        }
      }

      return json({ game: serializeGame(finalDoc) });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
