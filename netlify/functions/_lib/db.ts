import { MongoClient, type Db } from "mongodb";

/**
 * Opens a connection, runs the callback, and always closes it afterward. We deliberately
 * do NOT cache a MongoClient at module scope: that pattern only pays off when a warm
 * process is reused across invocations, and Netlify Dev's local function runtime
 * re-evaluates the module on every request (to support hot-reload), so a "cached" client
 * was in practice being recreated and never closed on every single call — leaking a new
 * connection per request until Atlas's connection limit was hit. Opening and closing per
 * request costs a few ms but is correct regardless of whether the runtime reuses the
 * process, in dev or in a real deployed function.
 */
export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is not set");
  const dbName = process.env.MONGODB_DB_NAME;
  if (!dbName) throw new Error("MONGODB_DB_NAME environment variable is not set");

  const client = new MongoClient(uri, { maxPoolSize: 5 });
  try {
    await client.connect();
    return await fn(client.db(dbName));
  } finally {
    await client.close();
  }
}
