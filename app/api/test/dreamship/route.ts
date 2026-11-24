import { z } from "zod";
import { dreamshipFixtures } from "@/lib/sources/dreamship";

export const dynamic = "force-dynamic";

const body = z.object({ referenceId: z.string(), productVariantIds: z.array(z.number()), status: z.string().optional(), importAfterPolls: z.number().int().min(0).optional() });

/** Test-only: the fixture Dreamship imports a Shopify order. 404 unless fixtures mode AND the e2e flag are both set. */
export async function POST(req: Request) {
  if (process.env.DATA_SOURCE !== "fixtures" || process.env.E2E_FIXTURE_RESET !== "1") return new Response("Not found", { status: 404 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "invalid" }, { status: 400 });
  const order = dreamshipFixtures().importOrder(p.data.referenceId, p.data.productVariantIds.map((productVariantId) => ({ productVariantId })), { status: p.data.status, importAfterPolls: p.data.importAfterPolls });
  return Response.json({ ok: true, order });
}
