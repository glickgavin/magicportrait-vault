import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { setSetting } from "@/lib/settings";
import { fixtureSources } from "@/lib/sources";
import { buildFixtureOrders } from "@/lib/sources/fixtures-data";
import { signSessionToken, verifySessionToken, verifyShopifyHmac } from "@/lib/gift/shopify-verify";
import { recordPaidOrder, sendDueOffers, sendMugReminders, type OrderPaid } from "@/lib/gift/offers";
import { POST as ordersPaid } from "@/app/api/webhooks/shopify/orders-paid/route";
import { POST as offerLink } from "@/app/api/gift/offer-link/route";

const SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const by = "test@example.com";
const orderId = () => String(7_000_000_000_000 + Math.floor(Math.random() * 1e9));
const paid = (over: Partial<OrderPaid> = {}): OrderPaid => ({
  id: orderId(),
  name: "#5001",
  email: `buyer${randomBytes(3).toString("hex")}@example.com`,
  contact_email: null,
  customer: null,
  created_at: new Date().toISOString(),
  processed_at: new Date().toISOString(),
  financial_status: "paid",
  cancelled_at: null,
  test: false,
  line_items: [{ product_id: 8471707222212, properties: [{ name: "_image_url", value: "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/x.png" }] }],
  ...over,
});
async function unlockedEvents(id: string) {
  return (await db().from("activity_log").select("id").eq("event", "free_gift_unlocked").eq("ref_id", id)).data ?? [];
}

describe("Shopify signatures", () => {
  it("webhook HMAC: valid, forged body, wrong secret", () => {
    const body = JSON.stringify({ id: 1 });
    const sig = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(true);
    expect(verifyShopifyHmac(body + " ", sig, SECRET)).toBe(false);
    expect(verifyShopifyHmac(body, sig, "other")).toBe(false);
    expect(verifyShopifyHmac(body, null, SECRET)).toBe(false);
  });
  it("checkout session token: valid, forged, expired, wrong shop, alg none", () => {
    const now = Math.floor(Date.now() / 1000);
    const good = signSessionToken({ dest: "https://shop.myshopify.com", exp: now + 60, nbf: now - 5 }, SECRET);
    expect(verifySessionToken(good, SECRET, { shopDomain: "shop.myshopify.com" })).toBeTruthy();
    expect(verifySessionToken(good, "other-secret")).toBeNull();
    expect(verifySessionToken(signSessionToken({ exp: now - 60 }, SECRET), SECRET)).toBeNull();
    expect(verifySessionToken(good, SECRET, { shopDomain: "evil.myshopify.com" })).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(`{"exp":${now + 60}}`).toString("base64url")}.`;
    expect(verifySessionToken(none, SECRET)).toBeNull();
  });
});

describe("orders/paid webhook", () => {
  const post = (body: string, headers: Record<string, string>) => ordersPaid(new Request("http://x/api/webhooks/shopify/orders-paid", { method: "POST", body, headers }));
  const signedHeaders = (body: string, id = `wh-${randomBytes(6).toString("hex")}`) => ({ "x-shopify-hmac-sha256": createHmac("sha256", SECRET).update(body).digest("base64"), "x-shopify-webhook-id": id, "x-shopify-topic": "orders/paid" });

  it("rejects a bad signature", async () => {
    const body = JSON.stringify(paid());
    expect((await post(body, { "x-shopify-hmac-sha256": "AAAA" })).status).toBe(401);
  });
  it("records a qualifying order once; replays are ignored", async () => {
    const o = paid();
    const body = JSON.stringify(o);
    const h = signedHeaders(body);
    expect(await (await post(body, h)).json()).toMatchObject({ created: true, status: "pending" });
    expect(await (await post(body, h)).json()).toMatchObject({ duplicate: true });
    expect(await (await post(body, signedHeaders(body))).json()).toMatchObject({ created: false });
    expect((await db().from("gift_offers").select("id").eq("shopify_order_id", o.id)).data).toHaveLength(1);
  });
  it("non-qualifying orders are recorded as skipped with the reason", async () => {
    for (const [over, reason] of [
      [{ test: true }, "test_order"],
      [{ cancelled_at: new Date().toISOString() }, "cancelled"],
      [{ financial_status: "pending" }, "financial_status:pending"],
    ] as const) {
      const o = paid(over);
      await recordPaidOrder(o);
      const r = (await db().from("gift_offers").select("status, skip_reason").eq("shopify_order_id", o.id).single()).data;
      expect(r).toEqual({ status: "skipped", skip_reason: reason });
    }
  });
  it("gift.unlock_rule = qualifying_products", async () => {
    await setSetting("gift.unlock_rule", "qualifying_products", by);
    await setSetting("gift.qualifying_product_ids", ["8600824643780"], by);
    expect((await recordPaidOrder(paid())).status).toBe("skipped");
    expect((await recordPaidOrder(paid({ line_items: [{ product_id: "8600824643780", properties: [] }] }))).status).toBe("pending");
    await setSetting("gift.unlock_rule", "any_paid_order", by);
    await setSetting("gift.qualifying_product_ids", [], by);
  });
});

describe("free_gift_unlocked", () => {
  beforeEach(async () => {
    await db().from("gift_offers").update({ status: "skipped", skip_reason: "test_cleanup" }).eq("status", "pending");
  });

  it("with the switch off nothing is sent", async () => {
    await setSetting("gift.offer_email_enabled", false, by);
    const o = paid();
    await recordPaidOrder(o);
    expect(await sendDueOffers()).toMatchObject({ sent: 0, skipped: 1 });
    expect(await unlockedEvents(o.id)).toHaveLength(0);
    expect((await db().from("gift_offers").select("status, skip_reason").eq("shopify_order_id", o.id).single()).data).toEqual({ status: "skipped", skip_reason: "offer_email_disabled" });
  });

  it("with it on, exactly one event per qualifying order, with a one-tap link for Klaviyo only", async () => {
    await setSetting("gift.offer_email_enabled", true, by);
    const o = paid();
    await recordPaidOrder(o);
    expect((await sendDueOffers()).sent).toBe(1);
    expect((await sendDueOffers()).sent).toBe(0);
    await recordPaidOrder(o); // a replay
    expect((await sendDueOffers()).sent).toBe(0);
    const ev = await unlockedEvents(o.id);
    expect(ev).toHaveLength(1);
    const outbox = (await db().from("outbound_events").select("payload, dedupe_key").eq("dedupe_key", `free_gift_unlocked:${o.id}`)).data as { payload: { data: { attributes: { properties: Record<string, string> } } } }[];
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload.data.attributes.properties.card_link).toMatch(/\/g\/[A-Za-z0-9_-]{43}$/);
    const act = (await db().from("activity_log").select("props").eq("id", ev[0].id).single()).data as { props: object };
    expect(JSON.stringify(act.props)).not.toContain("/g/");
    await setSetting("gift.offer_email_enabled", false, by);
  });

  it("respects the delay", async () => {
    await setSetting("gift.offer_email_enabled", true, by);
    await setSetting("gift.offer_email_delay_minutes", 60, by);
    const o = paid();
    await recordPaidOrder(o);
    expect((await sendDueOffers(new Date())).sent).toBe(0);
    expect((await sendDueOffers(new Date(Date.now() + 61 * 60_000))).sent).toBe(1);
    await setSetting("gift.offer_email_delay_minutes", 0, by);
    await setSetting("gift.offer_email_enabled", false, by);
  });
});

describe("POST /api/gift/offer-link (thank-you pop-up)", () => {
  const recent = () => {
    const o = structuredClone(buildFixtureOrders().find((x) => x.name === "#1001")!);
    const id = orderId();
    o.id = `gid://shopify/Order/${id}`;
    o.legacyId = id;
    o.name = "#9" + id.slice(-3);
    o.createdAt = o.processedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    fixtureSources().shopify.add(o);
    return o;
  };
  const token = (exp = 60) => signSessionToken({ dest: `https://${process.env.SHOPIFY_STORE_DOMAIN ?? "shop.myshopify.com"}`, exp: Math.floor(Date.now() / 1000) + exp }, SECRET);
  const call = (body: unknown, auth?: string) => offerLink(new Request("http://x/api/gift/offer-link", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) } }));

  beforeEach(async () => {
    await setSetting("gift.popup_enabled", true, by);
  });
  afterAll(async () => {
    await setSetting("gift.popup_enabled", false, by);
    await setSetting("gift.popup_email_later_enabled", false, by);
  });

  it("is off when gift.popup_enabled is off", async () => {
    await setSetting("gift.popup_enabled", false, by);
    expect((await call({ orderId: recent().legacyId }, token())).status).toBe(404);
  });
  it("rejects a missing token (a bare order number is never enough)", async () => expect((await call({ orderId: recent().legacyId })).status).toBe(401));
  it("rejects a forged token", async () => expect((await call({ orderId: recent().legacyId }, signSessionToken({ exp: Math.floor(Date.now() / 1000) + 60 }, "not-the-secret"))).status).toBe(401));
  it("rejects an expired token", async () => expect((await call({ orderId: recent().legacyId }, token(-120))).status).toBe(401));
  it("rejects an old order", async () => {
    const r = await call({ orderId: "5550000001001" }, token());
    expect(r.status).toBe(410);
    expect(await r.json()).toEqual({ error: "unavailable" });
  });
  it("returns a one-tap link for a recent order", async () => {
    const o = recent();
    const r = await call({ orderId: o.legacyId }, token());
    expect(r.status).toBe(200);
    const body = (await r.json()) as { url: string };
    expect(body.url).toMatch(/\/g\/[A-Za-z0-9_-]{43}$/);
    expect(body.url).not.toContain(o.legacyId);
    expect((await db().from("gift_offers").select("token_hash").eq("shopify_order_id", o.legacyId).single()).data?.token_hash).toHaveLength(64);
  });
  it("'Later, email me the link' is hidden until enabled, then queues free_gift_link_requested", async () => {
    const o = recent();
    expect((await call({ orderId: o.legacyId, action: "email_later" }, token())).status).toBe(404);
    await setSetting("gift.popup_email_later_enabled", true, by);
    expect((await call({ orderId: o.legacyId, action: "email_later" }, token())).status).toBe(200);
    const ev = await db().from("activity_log").select("id").eq("event", "free_gift_link_requested").eq("props->>order_id", o.legacyId);
    expect(ev.data).toHaveLength(1);
    await setSetting("gift.popup_email_later_enabled", false, by);
  });
});

describe("mug photo reminder", () => {
  it("off by default; when on, once per order with no photo and no lock", async () => {
    fixtureSources().shopify.reset();
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await db().from("gift_offers").upsert({ shopify_order_id: "5550000001001", order_name: "#1001", email: "sam@example.com", paid_at: old, status: "skipped", skip_reason: "test" }, { onConflict: "shopify_order_id" });
    await db().from("gift_offers").upsert({ shopify_order_id: "5550000001002", order_name: "#1002", email: "sam@example.com", paid_at: old, status: "skipped", skip_reason: "test" }, { onConflict: "shopify_order_id" });
    await db().from("outbound_events").delete().like("dedupe_key", "mug_photo_needed:%");
    expect(await sendMugReminders()).toEqual({ queued: 0, checked: 0 });
    await setSetting("redeem.mug_reminder_enabled", true, by);
    expect((await sendMugReminders()).queued).toBe(1); // #1001 needs a photo; #1002 is printed
    expect((await sendMugReminders()).queued).toBe(0);
    await setSetting("redeem.mug_reminder_enabled", false, by);
  });
});
