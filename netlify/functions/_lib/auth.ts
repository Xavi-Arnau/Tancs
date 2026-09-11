import { ObjectId, type Db } from "mongodb";
import type { PlayerLinkRecord } from "./models.js";
import { HttpError } from "./response.js";

export interface AuthContext {
  gameId: ObjectId;
  playerId: ObjectId;
  playerIdStr: string;
  slot: 0 | 1;
}

/**
 * Resolves a player's private token to their identity, and (when expectedGameId is
 * given) confirms the token actually belongs to that game. Takes the request's shared
 * `db` handle rather than opening its own, so one request uses exactly one connection.
 */
export async function requireAuth(
  db: Db,
  token: string | null | undefined,
  expectedGameId?: string,
): Promise<AuthContext> {
  if (!token) throw new HttpError(401, "Missing token");

  const link = await db
    .collection<PlayerLinkRecord>("player_links")
    .findOne({ token });

  if (!link) throw new HttpError(401, "Invalid token");
  if (expectedGameId && link.gameId.toHexString() !== expectedGameId) {
    throw new HttpError(403, "Token does not belong to this game");
  }

  return {
    gameId: link.gameId,
    playerId: link.playerId,
    playerIdStr: link.playerId.toHexString(),
    slot: link.slot,
  };
}

export function parseObjectId(id: string, label = "id"): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${label}`);
  return new ObjectId(id);
}
