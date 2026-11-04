import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { setSetting } from "@/lib/settings";
import { sendCardNow } from "@/lib/cards/send-now";

const outbox = mkdtempSync(path.join(tmpdir(), "vault-send-now-"));
process.env.EMAIL_OUTBOX_DIR = outbox;
const by = "test@example.com";

async function selfCard(sender: string, over: Record<string, unknown> = {}) {
  const v = (await db().from("theme_versions").select("id, theme_id").eq("status", "live").limit(1).single()).data as { id: string; theme_id: string };
  const r = await db()
    .from("cards")
    .insert({
      public_id: `C-${randomBytes(3).toString("hex")}`,
      share_slug: randomBytes(16).toString("base64url"),
      sender_email: sender,
      from_name: "Sam",
      to_name: "Rose",
      message: "secret message text",
      theme_id: v.theme_id,
      version_id: v.id,
      delivery: "self",
      status: "ready",
      jpeg_path: "x.jpg",
      ...over,
    })
    .select("*")
    .single();
  if (r.error) throw r.error;
  return r.data as { id: string; public_id: string };
}
const row = async (id: string) => (await db().from("cards").select("delivery, recipient_email, status").eq("id", id).single()).data!;

describe("ready screen Send", () => {
  beforeAll(async () => {
    await setSetting("cards.enabled", true, by);
  });
  afterAll(async () => {
    await setSetting("cards.email_sends_per_day", 20, by);
    rmSync(outbox, { recursive: true, force: true });
  });

  it("sends a created card to one address at once, then the same address is a resend and another is refused", async () => {
    const sender = `send${randomBytes(3).toString("hex")}@example.com`;
    const c = await selfCard(sender);
    const to = `r${randomBytes(3).toString("hex")}@example.com`;
    expect(await sendCardNow(sender, c.public_id, "not-an-email")).toMatchObject({ ok: false, error: "invalid_email" });
    expect(await sendCardNow(sender, c.public_id, to.toUpperCase())).toEqual({ ok: true, resent: false });
    expect(await row(c.id)).toMatchObject({ delivery: "email", recipient_email: to, status: "emailed" });
    expect(readdirSync(outbox).length).toBeGreaterThanOrEqual(1);
    expect(await sendCardNow(sender, c.public_id, to)).toEqual({ ok: true, resent: true });
    expect(await sendCardNow(sender, c.public_id, `other-${to}`)).toMatchObject({ ok: false, error: "already_sent", status: 409 });
    const deliveries = (await db().from("card_deliveries").select("type").eq("card_id", c.id)).data!.map((d) => d.type).sort();
    expect(deliveries).toEqual(["email", "resend"]);
  });

  it("only the owner can send", async () => {
    const c = await selfCard(`own${randomBytes(3).toString("hex")}@example.com`);
    expect(await sendCardNow("someone-else@example.com", c.public_id, "r@example.com")).toMatchObject({ ok: false, error: "not_found", status: 404 });
  });

  it("refuses suppressed addresses and cards that aren't finished", async () => {
    const sender = `sup${randomBytes(3).toString("hex")}@example.com`;
    const to = `blocked${randomBytes(3).toString("hex")}@example.com`;
    await db().from("email_suppressions").insert({ email: to, scope: "card_emails", reason: "unsubscribe" });
    const c = await selfCard(sender);
    expect(await sendCardNow(sender, c.public_id, to)).toMatchObject({ ok: false, error: "suppressed" });
    expect((await row(c.id)).recipient_email).toBeNull();
    const rendering = await selfCard(sender, { status: "rendering", jpeg_path: null });
    expect(await sendCardNow(sender, rendering.public_id, "x@example.com")).toMatchObject({ ok: false, error: "not_allowed" });
  });

  it("limits sends per person per day (cards.email_sends_per_day)", async () => {
    await setSetting("cards.email_sends_per_day", 2, by);
    const sender = `lim${randomBytes(3).toString("hex")}@example.com`;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const c = await selfCard(sender);
      results.push(await sendCardNow(sender, c.public_id, `r${i}${randomBytes(2).toString("hex")}@example.com`));
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(results[2]).toMatchObject({ error: "rate_limited", status: 429 });
  });
});
