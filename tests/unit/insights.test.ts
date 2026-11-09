import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { cardActions, cardsPerDay, entries, funnel, kpis, periods, topThemes } from "@/lib/admin/insights";
import { customerTimeline, deleteCustomer, exportCustomer } from "@/lib/admin/customers";
import { getObject, putObject } from "@/lib/storage";
import { createHash } from "node:crypto";

// An isolated window far in the future, so other tests' rows don't count.
// activity_log is append-only, so each run uses its own random year.
const YEAR = 2040 + Math.floor(Math.random() * 900);
const NOW = new Date(Date.UTC(YEAR, 2, 10, 12));
const day = (d: number, h = 10) => new Date(Date.UTC(YEAR, 2, d, h)).toISOString();

async function version(slug = "christmas") {
  const t = (await db().from("themes").select("id").eq("slug", slug).single()).data as { id: string };
  const v = (await db().from("theme_versions").select("id").eq("theme_id", t.id).limit(1).single()).data as { id: string };
  return { themeId: t.id, versionId: v.id };
}
async function card(sender: string, createdAt: string, slug = "christmas", over: Record<string, unknown> = {}) {
  const { themeId, versionId } = await version(slug);
  const r = await db()
    .from("cards")
    .insert({ public_id: `C-${randomBytes(3).toString("hex")}`, share_slug: randomBytes(16).toString("base64url"), sender_email: sender, from_name: "A", to_name: "B", message: "m", theme_id: themeId, version_id: versionId, delivery: "self", status: "ready", created_at: createdAt, ...over })
    .select("*")
    .single();
  if (r.error) throw r.error;
  return r.data as { id: string; public_id: string };
}
async function event(e: string, email: string | null, at: string) {
  const r = await db().from("activity_log").insert({ event: e, email, occurred_at: at, source: "vault", actor: "system" });
  if (r.error) throw r.error;
}

describe("insights KPIs", () => {
  it("counts this period and the previous one from seeded rows", async () => {
    const a = `kpi-a-${randomBytes(3).toString("hex")}@example.com`;
    const b = `kpi-b-${randomBytes(3).toString("hex")}@example.com`;
    // this week (7 days to 10 Mar): 3 cards by 2 people; previous week: 1 card
    await card(a, day(8));
    await card(a, day(9), "birthday");
    await card(b, day(9));
    await card(b, day(9), "christmas", { status: "failed" }); // never counted
    await card(a, day(1));
    for (const [e, n] of [["card_email_sent", 2], ["card_recipient_email_opened", 1], ["card_recipient_cta_tapped", 1], ["vault_signed_in", 4], ["redeem_mug_saved", 1], ["redeem_download_completed", 2], ["redeem_download_all_completed", 1]] as const) {
      for (let i = 0; i < n; i++) await event(e, a, day(9, 11));
    }
    await event("vault_signed_in", a, day(2));
    const k = Object.fromEntries((await kpis("7d", NOW)).map((x) => [x.key, x]));
    expect(k.cards_created).toMatchObject({ value: 3, previous: 1, change: 200 });
    expect(k.people_creating.value).toBe(2);
    expect(k.emailed.value).toBe(2);
    expect(k.recipient_opens.value).toBe(1);
    expect(k.recipient_taps.value).toBe(1);
    expect(k.sign_ins).toMatchObject({ value: 4, previous: 1, change: 300 });
    expect(k.mug_photos.value).toBe(1);
    expect(k.downloads.value).toBe(3);

    const perDay = await cardsPerDay("7d", NOW);
    expect(perDay.find((d) => d.day === `${YEAR}-03-09`)?.n).toBe(2);
    expect(perDay.find((d) => d.day === `${YEAR}-03-08`)?.n).toBe(1);
    const top = await topThemes("7d", NOW);
    expect(top[0]).toMatchObject({ theme: "Christmas", n: 2 });

    await event("card_create_tapped", a, day(9, 11));
    await event("card_created", a, day(9, 11));
    const f = await funnel("7d", NOW);
    expect(f.signed_in).toBe(1);
    expect(f.created).toBe(1);
  });

  it("periods: today and all time", () => {
    const p = periods("today", NOW, "UTC");
    expect(p.from.toISOString()).toBe(`${YEAR}-03-10T00:00:00.000Z`);
    expect(p.prevFrom!.toISOString()).toBe(`${YEAR}-03-09T00:00:00.000Z`);
    expect(periods("all", NOW).prevFrom).toBeNull();
  });
});

describe("customer timeline", () => {
  it("merges activity, Shopify orders and Imagen sessions, newest first", async () => {
    await event("vault_signed_in", "sam@example.com", "2026-10-25T10:00:00Z");
    const { items } = await customerTimeline("sam@example.com");
    const sources = new Set(items.map((i) => i.source));
    for (const s of ["vault", "shopify", "imagen"]) expect(sources.has(s as "vault")).toBe(true);
    for (let i = 1; i < items.length; i++) expect(items[i - 1].at >= items[i].at).toBe(true);
    const order = items.findIndex((i) => i.title === "Order #1001");
    const session = items.findIndex((i) => i.title.startsWith("Portrait session · Royal Robes"));
    const signin = items.findIndex((i) => i.at === "2026-10-25T10:00:00.000Z");
    expect(session).toBeGreaterThan(order); // 20 Oct session is older than the 21 Oct order
    expect(signin).toBeLessThan(order); // 25 Oct sign-in is newer
  });
});

describe("data export and deletion", () => {
  it("export includes cards, activity and settings changes", async () => {
    const e = `exp-${randomBytes(3).toString("hex")}@example.com`;
    await card(e, new Date().toISOString());
    await event("vault_signed_in", e, new Date().toISOString());
    const out = await exportCustomer(e, "super@example.com");
    expect(out.cards).toHaveLength(1);
    expect(out.activity.length).toBeGreaterThanOrEqual(1);
    expect(out.settings_changes).toEqual([]);
  });

  it("delete removes cards and files, anonymises activity, clears the outbox and suppresses the email", async () => {
    const e = `del-${randomBytes(3).toString("hex")}@example.com`;
    const prefix = createHash("sha256").update(e).digest("hex").slice(0, 20);
    const c = await card(e, new Date().toISOString(), "christmas", { jpeg_path: `del-${randomBytes(3).toString("hex")}.jpg`, portrait_path: `${prefix}/p1.jpg` });
    const jpegKey = ((await db().from("cards").select("jpeg_path").eq("id", c.id).single()).data as { jpeg_path: string }).jpeg_path;
    await putObject("cards", jpegKey, Buffer.from("jpeg"), "image/jpeg");
    await putObject("portraits", `${prefix}/p1.jpg`, Buffer.from("jpeg"), "image/jpeg");
    await event("vault_signed_in", e, new Date().toISOString());
    await db().from("outbound_events").insert({ kind: "event", email: e, event_name: "card_created", payload: { data: { attributes: {} } }, status: "pending" });
    await db().from("vault_members").insert({ email: e, created_via: "sign_in" });

    const r = await deleteCustomer(e, "super@example.com");
    expect(r.cards).toBe(1);
    expect(await getObject("cards", jpegKey)).toBeNull();
    expect(await getObject("portraits", `${prefix}/p1.jpg`)).toBeNull();
    expect((await db().from("cards").select("id").eq("sender_email", e)).data).toEqual([]);
    expect((await db().from("activity_log").select("id").eq("email", e)).data).toEqual([]);
    expect((await db().from("outbound_events").select("id").eq("email", e)).data).toEqual([]);
    expect((await db().from("email_suppressions").select("scope, reason").eq("email", e)).data).toEqual([{ scope: "all", reason: "deletion" }]);
    expect((await db().from("vault_members").select("email").eq("email", e)).data).toEqual([]);
    const job = await db().from("outbound_events").select("kind, payload").eq("kind", "deletion").order("created_at", { ascending: false }).limit(1).single();
    expect(JSON.stringify(job.data!.payload)).toContain(e);
    expect((await db().from("data_requests").select("type, status").eq("id", r.requestId).single()).data).toEqual({ type: "delete", status: "done" });
  });
});

describe("what people did with their cards", () => {
  async function act(e: string, email: string, cardId: string, at: string) {
    const r = await db().from("activity_log").insert({ event: e, email, occurred_at: at, source: "vault", actor: "customer", ref_type: "card", ref_id: cardId, props: { card_id: cardId } });
    if (r.error) throw r.error;
  }
  // Its own window (June of the run's year), apart from the other tests' March rows.
  const NOW2 = new Date(Date.UTC(YEAR, 5, 10, 12));
  const jday = (d: number, h = 10) => new Date(Date.UTC(YEAR, 5, d, h)).toISOString();
  it("counts distinct cards and people per action, and cards with nothing done yet", async () => {
    const a = `act-a-${randomBytes(3).toString("hex")}@example.com`;
    const b = `act-b-${randomBytes(3).toString("hex")}@example.com`;
    const c1 = `C-${randomBytes(3).toString("hex")}`;
    const c2 = `C-${randomBytes(3).toString("hex")}`;
    const c3 = `C-${randomBytes(3).toString("hex")}`;
    for (const [c, who] of [[c1, a], [c2, a], [c3, b]]) await act("card_created", who, c, jday(8));
    await act("card_email_sent", a, c1, jday(8, 11));
    await act("card_downloaded", a, c1, jday(8, 12)); // same card, two actions
    await act("card_shared", b, c3, jday(9));
    await act("card_shared", b, c3, jday(9, 11)); // shared twice still counts once
    const r = await cardActions("7d", NOW2);
    expect(r.emailed).toEqual({ cards: 1, people: 1 });
    expect(r.downloaded).toEqual({ cards: 1, people: 1 });
    expect(r.shared).toEqual({ cards: 1, people: 1 });
    expect(r.link_copied).toEqual({ cards: 0, people: 0 });
    expect(r.made).toBe(3);
    expect(r.not_yet).toBe(1); // c2
  });
});

describe("where people came from", () => {
  const NOW3 = new Date(Date.UTC(YEAR, 8, 10, 12));
  const sday = (d: number, h = 10) => new Date(Date.UTC(YEAR, 8, d, h)).toISOString();
  async function ev(e: string, email: string | null, at: string, props: Record<string, unknown> = {}) {
    const r = await db().from("activity_log").insert({ event: e, email, occurred_at: at, source: "vault", actor: "customer", props });
    if (r.error) throw r.error;
  }
  it("offer email: sent, clicked, made a card; tracked links: clicks, sign-ins credited, made a card", async () => {
    const a = `ent-a-${randomBytes(3).toString("hex")}@example.com`;
    const b = `ent-b-${randomBytes(3).toString("hex")}@example.com`;
    const c = `ent-c-${randomBytes(3).toString("hex")}@example.com`;
    for (let i = 0; i < 4; i++) await ev("gift_offer_email_sent", `o${i}${a}`, sday(8));
    await ev("gift_offer_email_opened", a, sday(8, 11));
    await ev("vault_signed_in", a, sday(8, 11), { method: "link", entry: "offer_email" });
    await ev("card_created", a, sday(8, 12));
    for (let i = 0; i < 3; i++) await ev("vault_entry_link_opened", null, sday(9), { entry: "invoice" });
    await ev("vault_signed_in", b, sday(9, 11), { method: "code", entry: "invoice" });
    await ev("vault_signed_in", b, sday(9, 12), { method: "code", entry: "invoice" }); // twice, one person
    await ev("vault_signed_in", c, sday(9, 13), { method: "code", entry: "invoice" });
    await ev("card_created", c, sday(9, 14));
    const r = await entries("7d", ["invoice", "order-page"], NOW3);
    expect(r.offer_email).toEqual({ sent: 4, clicked: 1, cards: 1 });
    expect(r.links).toEqual([
      { entry: "invoice", clicks: 3, signed_in: 2, cards: 1 },
      { entry: "order-page", clicks: 0, signed_in: 0, cards: 0 },
    ]);
  });
});
