import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { setSetting, clearSettingsCache } from "@/lib/settings";
import { backoffMs, flushOutbox, flushRow, klaviyoEventOutbox, queueProfileUpdate } from "@/lib/klaviyo";
import { track } from "@/lib/track";

async function row(id: string) {
  return (await db().from("outbound_events").select("*").eq("id", id).single()).data as { status: string; attempts: number; payload: { data: { attributes: { properties: Record<string, unknown> } } }; next_attempt_at: string; last_status_code: number | null };
}
const email = () => `k${randomBytes(3).toString("hex")}@example.com`;

describe("Klaviyo outbox", () => {
  beforeEach(async () => {
    process.env.KLAVIYO_PROVIDER = "fixtures";
    delete process.env.KLAVIYO_FIXTURE_FAIL;
    await setSetting("klaviyo.enabled", true, "test@example.com");
    clearSettingsCache();
  });
  afterEach(async () => {
    delete process.env.KLAVIYO_FIXTURE_FAIL;
    await setSetting("klaviyo.enabled", false, "test@example.com");
  });

  it("klaviyo.enabled off writes the row as skipped and sends nothing", async () => {
    await setSetting("klaviyo.enabled", false, "test@example.com");
    const r = await track("card_created", { card_id: "C-aaaaaa", theme_name: "Christmas" }, { email: email() });
    expect((await row(r.outboxId!)).status).toBe("skipped");
  });

  it("sends at once with a fixed property list (never message text or recipient details)", async () => {
    const r = await track(
      "card_created",
      { card_id: "C-bbbbbb", theme_name: "Christmas", category: "Holidays", delivery: "email", scheduled: false, cards_created_total: 1, first_card: true, theme_slug: "christmas-snowfall", message: "secret", to_name: "Rose", recipient_email: "r@example.com" },
      { email: email() },
    );
    const o = await row(r.outboxId!);
    expect(o.status).toBe("sent");
    expect(o.payload.data.attributes.properties).toEqual({ card_id: "C-bbbbbb", theme_name: "Christmas", category: "Holidays", delivery: "email", scheduled: false, cards_created_total: 1, first_card: true });
  });

  it("one-tap links go to Klaviyo only when klaviyo.include_signin_link is on, and never to activity_log", async () => {
    const e = email();
    const out = await klaviyoEventOutbox("free_gift_unlocked", { order_name: "#1001" }, e, { card_link: "https://x/g/abc" });
    expect(out!.payload).toMatchObject({ data: { attributes: { properties: { order_name: "#1001", card_link: "https://x/g/abc" } } } });
    await setSetting("klaviyo.include_signin_link", false, "test@example.com");
    const out2 = await klaviyoEventOutbox("free_gift_unlocked", { order_name: "#1001" }, e, { card_link: "https://x/g/abc" });
    expect((out2!.payload as { data: { attributes: { properties: object } } }).data.attributes.properties).toEqual({ order_name: "#1001" });
    await setSetting("klaviyo.include_signin_link", true, "test@example.com");
    const r = await track("free_gift_unlocked", { order_id: "1", order_name: "#1001" }, { email: e, klaviyo: { extra: { card_link: "https://x/g/secret" } } });
    const a = (await db().from("activity_log").select("props").eq("id", r.activityId!).single()).data as { props: object };
    expect(JSON.stringify(a.props)).not.toContain("/g/");
  });

  it("dedupe keys make an event fire once", async () => {
    const e = email();
    const key = `test:${randomBytes(4).toString("hex")}`;
    const a = await track("mug_photo_needed", { order_name: "#1" }, { email: e, klaviyo: { dedupeKey: key } });
    const b = await track("mug_photo_needed", { order_name: "#1" }, { email: e, klaviyo: { dedupeKey: key } });
    expect(a.outboxId).toBeTruthy();
    expect(b.outboxId).toBeNull();
  });

  it("5xx retries with backoff, honours max attempts, then fails and logs error_klaviyo_send_failed", async () => {
    process.env.KLAVIYO_FIXTURE_FAIL = "503";
    const r = await track("card_email_sent", { card_id: "C-cccccc", theme_name: "X" }, { email: email() });
    let o = await row(r.outboxId!);
    expect(o).toMatchObject({ status: "pending", attempts: 1, last_status_code: 503 });
    expect(new Date(o.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 50_000);
    await setSetting("klaviyo.max_attempts", 3, "test@example.com");
    await flushRow(r.outboxId!);
    await flushRow(r.outboxId!);
    o = await row(r.outboxId!);
    expect(o).toMatchObject({ status: "failed", attempts: 3 });
    const err = await db().from("activity_log").select("props").eq("event", "error_klaviyo_send_failed").order("id", { ascending: false }).limit(1).single();
    expect(err.data).toMatchObject({ props: { event: "card_email_sent", status_code: 503 } });
    await setSetting("klaviyo.max_attempts", 8, "test@example.com");
  });

  it("a 4xx (not 429) fails at once", async () => {
    process.env.KLAVIYO_FIXTURE_FAIL = "400";
    const r = await track("card_email_sent", { card_id: "C-dddddd", theme_name: "X" }, { email: email() });
    expect((await row(r.outboxId!)).status).toBe("failed");
  });

  it("cron flushes due rows", async () => {
    process.env.KLAVIYO_FIXTURE_FAIL = "500";
    const r = await track("card_recipient_email_opened", { card_id: "C-eeeeee" }, { email: email() });
    delete process.env.KLAVIYO_FIXTURE_FAIL;
    const later = new Date(Date.now() + 10 * 60_000);
    const counts = await flushOutbox(later);
    expect(counts.sent).toBeGreaterThanOrEqual(1);
    expect((await row(r.outboxId!)).status).toBe("sent");
  });

  it("profile updates carry only the five My MP properties", async () => {
    const id = await queueProfileUpdate(email(), { "My MP Cards Created": 2, "My MP Has Free Gift": true });
    const o = (await db().from("outbound_events").select("payload, status, kind").eq("id", id!).single()).data as { payload: { data: { attributes: { properties: object } } }; status: string; kind: string };
    expect(o.kind).toBe("profile");
    expect(o.status).toBe("sent");
    expect(o.payload.data.attributes.properties).toEqual({ "My MP Cards Created": 2, "My MP Has Free Gift": true });
  });

  it("backoff doubles and is capped", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(30)).toBe(6 * 3600_000);
  });
});
