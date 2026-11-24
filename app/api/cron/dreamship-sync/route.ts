import { cronAuthorized, cronResponse } from "@/lib/cron";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily, when dreamship.sync_enabled: compares every linked product with Dreamship and keeps the report. Never writes to Shopify. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!(await getSettings(["dreamship.sync_enabled"] as const))["dreamship.sync_enabled"]) return cronResponse({ skipped: "dreamship.sync_enabled is off" });
  const { dailyDreamshipCheck } = await import("@/lib/dreamship/link");
  return cronResponse(await dailyDreamshipCheck());
}
