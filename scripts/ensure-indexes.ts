/**
 * One-time setup: creates the indexes the app relies on. Run manually after pointing
 * MONGODB_URI/MONGODB_DB_NAME at a fresh database — not run on the request hot path,
 * since createIndex is a network round trip we don't want on every function invocation.
 *
 * Usage: node --env-file=.env scripts/ensure-indexes.ts
 */
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");
  if (!dbName) throw new Error("MONGODB_DB_NAME environment variable is not set");

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    await Promise.all([
      db.collection("player_links").createIndex({ token: 1 }, { unique: true }),
      db.collection("games").createIndex({ inviteToken: 1 }, { unique: true }),
      db.collection("turns").createIndex({ gameId: 1, turnNumber: 1 }, { unique: true }),
    ]);
    console.log(`Indexes ensured on database "${dbName}".`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
