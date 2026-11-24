import { clientIp, hashKey, json, rateLimit } from "@/lib/auth/http";
import { addSchema, addStoreLine, storeCartView } from "@/lib/open-store/cart";
import { asker } from "@/lib/open-store/owner";
import { ensureVisitor } from "@/lib/open-store/visitor";

export const dynamic = "force-dynamic";

/** Add to cart: `{ generationId, variantId, quantity, from, layer? }`. The picture must be this visitor's (or a linked email's). */
export async function POST(req: Request) {
  if (!(await rateLimit(`store-cart-ip:${hashKey(await clientIp(req))}`, 120))) return json({ error: "rate_limited" }, 429);
  const p = addSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const visitor = await ensureVisitor();
  const a = await asker();
  const r = await addStoreLine({ ...a, visitor: a.visitor ?? visitor }, visitor, p.data);
  if (!r.ok) return json(r.message ? { error: r.error, message: r.message } : { error: r.error }, r.status);
  return json({ ok: true, cart: await storeCartView({ ...a, visitor: a.visitor ?? visitor }) });
}
