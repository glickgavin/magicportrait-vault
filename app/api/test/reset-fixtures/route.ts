import { fixtureSources } from "@/lib/sources";
import { dreamshipFixtures } from "@/lib/sources/dreamship";

export const dynamic = "force-dynamic";

/** Test-only: resets the in-memory fixture Shopify and Dreamship. 404 unless fixtures mode AND the e2e flag are both set. */
export async function POST() {
  if (process.env.DATA_SOURCE !== "fixtures" || process.env.E2E_FIXTURE_RESET !== "1") return new Response("Not found", { status: 404 });
  fixtureSources().shopify.reset();
  dreamshipFixtures().reset();
  return Response.json({ ok: true });
}
