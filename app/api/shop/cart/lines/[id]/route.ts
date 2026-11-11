import { z } from "zod";
import { hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { shopUserOrNull } from "@/lib/shop";
import { changeQuantity, removeLine } from "@/lib/shop/cart";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

async function guard(params: Promise<{ id: string }>) {
  const u = await shopUserOrNull();
  if (!u) return null;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return null;
  const max = (await getSettings(["shop.cart_rate_limit_per_hour"] as const))["shop.cart_rate_limit_per_hour"];
  if (!(await rateLimit(`shop-cart:${hashKey(u.email)}`, max))) return { u, id: id.data, limited: true };
  return { u, id: id.data, limited: false };
}

/** Change a line's quantity (only in the person's own open cart). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (!g) return notFoundJson();
  if (g.limited) return json({ error: "rate_limited" }, 429);
  const p = z.object({ quantity: z.number().int() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const r = await changeQuantity(g.u.email, g.id, p.data.quantity);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (!g) return notFoundJson();
  if (g.limited) return json({ error: "rate_limited" }, 429);
  const r = await removeLine(g.u.email, g.id);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
}
