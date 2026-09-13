import { getTankClass, getWeapon, MAX_DISTINCT_WEAPONS, maxHpFor, WIND_MAX } from "@tancs/shared";
import type { Context } from "@netlify/functions";
import { requireAuth } from "./_lib/auth.js";
import { withDb } from "./_lib/db.js";
import type { GameRecord } from "./_lib/models.js";
import { serializeGame } from "./_lib/models.js";
import { optionalString, parseJsonBody, requireString } from "./_lib/request.js";
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
    const distinctWeaponIds = new Set(purchases.filter((p) => p.quantity > 0).map((p) => p.weaponId));
    if (distinctWeaponIds.size > MAX_DISTINCT_WEAPONS) {
      throw new HttpError(400, `Can't select more than ${MAX_DISTINCT_WEAPONS} different weapon types`);
    }
    const tankClassId = optionalString(body, "tankClassId") ?? "standard";
    // Validate against the real table rather than trusting the client string as-is —
    // getTankClass already falls back to "standard" for an unknown id, but we want an
    // explicit 400 for a bogus id rather than silently defaulting.
    if (getTankClass(tankClassId).id !== tankClassId) {
      throw new HttpError(400, `Unknown tank class: ${tankClassId}`);
    }

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
            [`${playersPath}.tankClass`]: tankClassId,
            // Full heal to the new class's max — valid since buy phase is always pre-battle,
            // no damage has been taken yet.
            [`${playersPath}.hp`]: maxHpFor(tankClassId),
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
        // If the CPU is chosen to go first, its own move is handled the same way as every
        // other CPU turn: the client notices it's the CPU's turn and calls resolve-cpu-turn
        // (see GameView.tsx) — no special-casing needed here.
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
        }
      }

      return json({ game: serializeGame(finalDoc) });
    });
  } catch (err) {
    return errorResponse(err);
  }
};
