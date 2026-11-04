import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";

export function hashKey(v: string): string {
  return createHash("sha256").update(v.toLowerCase()).digest("hex").slice(0, 24);
}

export async function clientIp(req?: Request): Promise<string> {
  const h = req ? req.headers : await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

/** Atomic counter in Postgres (`hit_rate_limit`). Fails open only if the database is down. */
export async function rateLimit(key: string, max: number, windowSeconds = 3600): Promise<boolean> {
  const { data, error } = await db().rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) {
    console.error(`[rate-limit] ${error.message}`);
    return true;
  }
  return data === true;
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });
}

export const notFoundJson = () => json({ error: "not_found" }, 404);
