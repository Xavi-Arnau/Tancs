import type { Context } from "@netlify/functions";
import { withDb } from "./_lib/db.js";
import { errorResponse, json } from "./_lib/response.js";

export default async (_req: Request, _context: Context): Promise<Response> => {
  try {
    await withDb((db) => db.command({ ping: 1 }));
    return json({ ok: true, db: "connected" });
  } catch (err) {
    return errorResponse(err);
  }
};
