import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { dreamshipCard, linkProduct, linkSchema, saveSchema, saveSync, syncProduct } from "@/lib/dreamship/link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [linkSchema.extend({ action: z.literal("link") }), z.object({ action: z.literal("sync"), productId: z.string().regex(/^\d{1,20}$/) }), saveSchema.extend({ action: z.literal("save") })]);

/** A product's Dreamship card (docs/dreamship.md › Part A): link, Sync from Dreamship (no writes), Save to Shopify. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const r = p.data.action === "link" ? await linkProduct(u, p.data) : p.data.action === "sync" ? await syncProduct(u, p.data.productId) : await saveSync(u, p.data);
  if (!r.ok) return json({ error: r.error }, r.status);
  return json({ ok: true, card: await dreamshipCard(p.data.productId) , result: r });
}
