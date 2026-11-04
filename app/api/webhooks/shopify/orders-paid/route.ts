import { shopifyWebhookSecrets } from "@/lib/sources/shopify-auth";
import { verifyShopifyHmac } from "@/lib/gift/shopify-verify";
import { orderPaidSchema, recordPaidOrder } from "@/lib/gift/offers";
import { claimWebhook } from "@/lib/email/webhook";

export const dynamic = "force-dynamic";

/** orders/paid: HMAC checked on the raw body before parsing; idempotent on X-Shopify-Webhook-Id and the order id. */
export async function POST(req: Request) {
  const secrets = shopifyWebhookSecrets();
  if (!secrets.length) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  if (!secrets.some((s) => verifyShopifyHmac(raw, hmac, s))) {
    // No body or customer data in the log: just enough to see that Shopify called and the key didn't match.
    console.warn(`[webhook] shopify ${req.headers.get("x-shopify-topic") ?? "?"}: signature matched no configured secret (${hmac ? "hmac present" : "no hmac"})`);
    return new Response("Invalid signature", { status: 401 });
  }
  const id = req.headers.get("x-shopify-webhook-id");
  if (id && !(await claimWebhook("shopify", id, req.headers.get("x-shopify-topic")))) return Response.json({ ok: true, duplicate: true });
  const parsed = orderPaidSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return Response.json({ ok: true, ignored: "unrecognised payload" });
  const r = await recordPaidOrder(parsed.data);
  return Response.json({ ok: true, created: r.created, status: r.status });
}
