import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { setSetting } from "@/lib/settings";
import { giftOfferEmailStats, recordPaidOrder, sendDueOffers, unsubscribeFromOffers, type OrderPaid } from "@/lib/gift/offers";
import { handleAgentMailEvent } from "@/lib/email/webhook";
import { consumeSigninLink } from "@/lib/auth/links";

const outbox = mkdtempSync(path.join(tmpdir(), "vault-offer-mail-"));
process.env.EMAIL_OUTBOX_DIR = outbox;
const by = "test@example.com";

const paid = (): OrderPaid & { email: string } => ({
  id: String(8_000_000_000_000 + Math.floor(Math.random() * 1e9)),
  name: "#6001",
  email: `offer${randomBytes(3).toString("hex")}@example.com`,
  contact_email: null,
  customer: null,
  created_at: new Date().toISOString(),
  processed_at: new Date().toISOString(),
  financial_status: "paid",
  cancelled_at: null,
  test: false,
  line_items: [{ product_id: 8471707222212, properties: [{ name: "_image_url", value: "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/x.png" }] }],
});
const mailsTo = (email: string) =>
  readdirSync(outbox)
    .map((f) => JSON.parse(readFileSync(path.join(outbox, f), "utf8")) as { id: string; to: string; subject: string; html: string; text: string; headers: Record<string, string>; idempotencyKey: string })
    .filter((m) => m.to === email);
const offer = async (orderId: string) =>
  (await db().from("gift_offers").select("id, status, email_status, provider_message_id, delivered_at, first_used_at, skip_reason").eq("shopify_order_id", orderId).single()).data!;

describe("free gift offer email via AgentMail", () => {
  beforeEach(async () => {
    await db().from("gift_offers").update({ status: "skipped", skip_reason: "test_cleanup" }).eq("status", "pending");
    await setSetting("gift.offer_email_enabled", true, by);
    await setSetting("gift.offer_email_channel", "agentmail", by);
  });
  afterAll(async () => {
    await setSetting("gift.offer_email_enabled", false, by);
    rmSync(outbox, { recursive: true, force: true });
  });

  it("sends one email per order with the one-tap link and unsubscribe, and records the message id", async () => {
    const o = paid();
    await recordPaidOrder(o);
    expect((await sendDueOffers()).sent).toBe(1);
    expect((await sendDueOffers()).sent).toBe(0);
    const mails = mailsTo(o.email);
    expect(mails).toHaveLength(1);
    const m = mails[0];
    expect(m.subject).toBe("Your free greeting card is ready");
    expect(m.html).toMatch(/\/g\/[A-Za-z0-9_-]{43}/);
    const row = await offer(o.id);
    expect(m.html).toContain(`/gift/unsubscribe?o=${row.id}`);
    expect(m.headers["List-Unsubscribe"]).toContain(`/gift/unsubscribe?o=${row.id}`);
    expect(m.idempotencyKey).toBe(`gift-offer-${row.id}`);
    expect(row).toMatchObject({ status: "sent", email_status: "sent", provider_message_id: m.id });
    // The link never goes into activity_log.
    const act = (await db().from("activity_log").select("props").eq("event", "gift_offer_email_sent").eq("ref_id", o.id)).data!;
    expect(act).toHaveLength(1);
    expect(JSON.stringify(act[0].props)).not.toContain("/g/");
  });

  it("tracks delivered, clicked (first use of the link) and bounces", async () => {
    const o = paid();
    await recordPaidOrder(o);
    await sendDueOffers();
    const m = mailsTo(o.email)[0];
    await handleAgentMailEvent({ event_type: "message.delivered", delivery: { message_id: m.id, recipients: [o.email] } });
    expect((await offer(o.id)).email_status).toBe("delivered");

    const token = m.html.match(/\/g\/([A-Za-z0-9_-]{43})/)![1];
    const used = await consumeSigninLink(token);
    expect(used.status).toBe("ok");

    const before = await giftOfferEmailStats(1);
    expect(before.sent).toBeGreaterThanOrEqual(1);
    expect(before.delivered).toBeGreaterThanOrEqual(1);

    await handleAgentMailEvent({ event_type: "message.bounced", bounce: { message_id: m.id, type: "Permanent", sub_type: "General", recipients: [{ address: o.email }] } });
    expect((await offer(o.id)).email_status).toBe("bounced");
    expect((await db().from("email_suppressions").select("scope").eq("email", o.email)).data).toEqual([{ scope: "all" }]);
  });

  it("“Don't email me offers” suppresses later offers to that address", async () => {
    const o = paid();
    await recordPaidOrder(o);
    await sendDueOffers();
    expect(await unsubscribeFromOffers((await offer(o.id)).id)).toBe(true);
    expect(await unsubscribeFromOffers("not-an-id")).toBe(false);
    const again = { ...paid(), email: o.email };
    await recordPaidOrder(again);
    expect(await sendDueOffers()).toMatchObject({ sent: 0, skipped: 1 });
    expect(await offer(again.id)).toMatchObject({ status: "skipped", skip_reason: "suppressed" });
    expect(mailsTo(o.email)).toHaveLength(1);
  });

  it("channel klaviyo sends no email (the Klaviyo flow does)", async () => {
    await setSetting("gift.offer_email_channel", "klaviyo", by);
    const o = paid();
    await recordPaidOrder(o);
    expect((await sendDueOffers()).sent).toBe(1);
    expect(mailsTo(o.email)).toHaveLength(0);
    expect((await offer(o.id)).email_status).toBeNull();
  });
});
