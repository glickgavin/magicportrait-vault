import { getShopCartSource } from "@/lib/shop/sources";

export const dynamic = "force-dynamic";

/** Test-only: a fixture Shopify cart's lines and their attributes. 404 unless fixtures mode AND the e2e flag are both set. */
export async function GET(req: Request) {
  if (process.env.DATA_SOURCE !== "fixtures" || process.env.E2E_FIXTURE_RESET !== "1") return new Response("Not found", { status: 404 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const cart = await (await getShopCartSource()).get(id).catch(() => null);
  if (!cart) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ lines: cart.lines.map((l) => ({ merchandiseId: l.merchandiseId, attributes: l.attributes })) });
}
