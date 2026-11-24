import { cronAuthorized, cronResponse } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 5 minutes: the customer's picture onto Dreamship orders that have been imported since (never submits or cancels). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const { runDueJobs } = await import("@/lib/dreamship/artwork");
  return cronResponse(await runDueJobs());
}
