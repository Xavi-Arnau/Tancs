export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function errorResponse(err: unknown): Promise<Response> {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status);
  }
  console.error(err);
  return json({ error: "Internal server error" }, 500);
}
