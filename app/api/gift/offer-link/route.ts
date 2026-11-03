import { z } from "zod";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { clientIp, hashKey, rateLimit } from "@/lib/auth/http";
import { verifySessionToken } from "@/lib/gift/shopify-verify";
import { popupLinkFor } from "@/lib/gift/offers";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "cache-control": "no-store" };
const out = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

const schema = z.object({ orderId: z.string().regex(/^\d{6,20}$/), action: z.enum(["link", "email_later"]).default("link") });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * The thank-you pop-up (GiftSheet). Accepts ONLY a request carrying a Shopify checkout-extension
 * session token, verified with the app secret, for an order paid within gift.popup_window_minutes.
 * A bare order number is never enough. Errors don't say whether an order exists.
 */
export async function POST(req: Request) {
  const s = await getSettings(["gift.popup_enabled", "gift.popup_email_later_enabled", "gift.offer_link_rate_limit_per_hour"] as const);
  if (!s["gift.popup_enabled"]) return out({ error: "unavailable" }, 404);
  if (!(await rateLimit(`offer-link:${hashKey(await clientIp(req))}`, s["gift.offer_link_rate_limit_per_hour"]))) return out({ error: "rate_limited" }, 429);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const secret = env.optional("SHOPIFY_WEBHOOK_SECRET") ?? "";
  const claims = token ? verifySessionToken(token, secret, { shopDomain: env.optional("SHOPIFY_STORE_DOMAIN") }) : null;
  if (!claims) return out({ error: "unauthorized" }, 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return out({ error: "invalid" }, 400);
  const r = await popupLinkFor(parsed.data.orderId);
  if ("error" in r) return out({ error: "unavailable" }, r.error === "too_old" ? 410 : 404);
  if (parsed.data.action === "email_later") {
    if (!s["gift.popup_email_later_enabled"]) return out({ error: "unavailable" }, 404);
    await track("free_gift_link_requested", { order_id: parsed.data.orderId, order_name: r.orderName }, { email: r.email, source: "shopify", klaviyo: { dedupeKey: `free_gift_link_requested:${parsed.data.orderId}`, extra: { card_link: r.url, link_expires_at: r.expiresAt } } });
    return out({ ok: true });
  }
  return out({ url: r.url, expiresAt: r.expiresAt });
}
