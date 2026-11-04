import { cronAuthorized, cronResponse } from "@/lib/cron";
import { flushOutbox } from "@/lib/klaviyo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return cronResponse(await flushOutbox());
}
