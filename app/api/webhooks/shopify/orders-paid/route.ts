import { env } from "@/lib/env";
import { verifyShopifyHmac } from "@/lib/gift/shopify-verify";
import { orderPaidSchema, recordPaidOrder } from "@/lib/gift/offers";
import { claimWebhook } from "@/lib/email/webhook";

export const dynamic = "force-dynamic";

/** orders/paid: HMAC checked on the raw body before parsing; idempotent on X-Shopify-Webhook-Id and the order id. */
export async function POST(req: Request) {
  const secret = env.optional("SHOPIFY_WEBHOOK_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), secret)) return new Response("Invalid signature", { status: 401 });
  const id = req.headers.get("x-shopify-webhook-id");
  if (id && !(await claimWebhook("shopify", id, req.headers.get("x-shopify-topic")))) return Response.json({ ok: true, duplicate: true });
  const parsed = orderPaidSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return Response.json({ ok: true, ignored: "unrecognised payload" });
  const r = await recordPaidOrder(parsed.data);
  return Response.json({ ok: true, created: r.created, status: r.status });
}
