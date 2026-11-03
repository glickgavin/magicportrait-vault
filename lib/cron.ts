import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Anything else is a 401. */
export function cronAuthorized(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export function cronResponse(body: unknown) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
