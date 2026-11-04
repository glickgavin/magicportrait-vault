import { cronAuthorized, cronResponse } from "@/lib/cron";
import { sendDueOffers } from "@/lib/gift/offers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  return cronResponse(await sendDueOffers());
}
