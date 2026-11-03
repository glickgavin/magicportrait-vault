import { cronAuthorized, cronResponse } from "@/lib/cron";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Daily: deletes rate-limit windows older than a day. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const { data } = await db().rpc("prune_rate_limits");
  return cronResponse({ pruned: data ?? 0 });
}
