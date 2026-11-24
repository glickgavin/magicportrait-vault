import { fixtureSources } from "@/lib/sources";
import { dreamshipFixtures } from "@/lib/sources/dreamship";

export const dynamic = "force-dynamic";

/**
 * Test-only: resets the in-memory fixture Shopify (orders) and Dreamship; with `?shop=1`, also the shop's product
 * catalogue (and its caches). 404 unless fixtures mode AND the e2e flag are both set.
 */
export async function POST(req: Request) {
  if (process.env.DATA_SOURCE !== "fixtures" || process.env.E2E_FIXTURE_RESET !== "1") return new Response("Not found", { status: 404 });
  fixtureSources().shopify.reset();
  dreamshipFixtures().reset();
  if (new URL(req.url).searchParams.get("shop") === "1") {
    const { shopFixtures } = await import("@/lib/shop/sources");
    const { invalidateCatalog } = await import("@/lib/shop");
    shopFixtures().reset();
    await invalidateCatalog();
  }
  return Response.json({ ok: true });
}
