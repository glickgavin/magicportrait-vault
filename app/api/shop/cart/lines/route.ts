import { clientIp, hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { shopUserOrNull } from "@/lib/shop";
import { addLineSchema, addToCart } from "@/lib/shop/cart";

export const dynamic = "force-dynamic";

/** Add to cart. Everything is checked again on the server: the picture, the size, the crop. */
export async function POST(req: Request) {
  const u = await shopUserOrNull();
  if (!u) return notFoundJson();
  const max = (await getSettings(["shop.cart_rate_limit_per_hour"] as const))["shop.cart_rate_limit_per_hour"];
  const [a, b] = await Promise.all([rateLimit(`shop-cart:${hashKey(u.email)}`, max), rateLimit(`shop-cart-ip:${hashKey(await clientIp(req))}`, max * 3)]);
  if (!a || !b) return json({ error: "rate_limited" }, 429);
  const p = addLineSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const r = await addToCart(u.email, p.data);
  return r.ok ? json({ ok: true, lineId: r.lineId, count: r.count }) : json({ error: r.error }, r.status);
}
