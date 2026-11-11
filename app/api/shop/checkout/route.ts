import { clientIp, hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { getSettings } from "@/lib/settings";
import { shopUserOrNull } from "@/lib/shop";
import { checkoutSchema, startCheckout } from "@/lib/shop/cart";

export const dynamic = "force-dynamic";

/** Checkout: checks every line again, saves the gift details on Shopify's cart, returns Shopify's checkout link. */
export async function POST(req: Request) {
  const u = await shopUserOrNull();
  if (!u) return notFoundJson();
  const max = (await getSettings(["shop.checkout_rate_limit_per_hour"] as const))["shop.checkout_rate_limit_per_hour"];
  const [a, b] = await Promise.all([rateLimit(`shop-checkout:${hashKey(u.email)}`, max), rateLimit(`shop-checkout-ip:${hashKey(await clientIp(req))}`, max * 3)]);
  if (!a || !b) return json({ error: "rate_limited" }, 429);
  const p = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const r = await startCheckout(u.email, p.data);
  return r.ok ? json({ ok: true, checkoutUrl: r.checkoutUrl }) : json({ error: r.error, lines: r.lines ?? [] }, r.status);
}
