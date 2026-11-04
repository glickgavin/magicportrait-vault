import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";
import { previewProps, renderEmail, TEMPLATES } from "@/lib/email/render";
import { claimWebhook, handleAgentMailEvent, verifySvix } from "@/lib/email/webhook";
import { sendDue } from "@/lib/cards/send";
import { db } from "@/lib/db/client";

const outbox = mkdtempSync(path.join(tmpdir(), "vault-mail-"));
process.env.EMAIL_OUTBOX_DIR = outbox;
afterAll(() => rmSync(outbox, { recursive: true, force: true }));

describe("email templates", () => {
  for (const name of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
    it(`${name} renders (snapshot)`, async () => {
      const out = await renderEmail(name, previewProps(name) as never);
      expect(out.subject).toMatchSnapshot();
      expect(out.text).toMatchSnapshot();
      expect(out.html).toContain("Magic Portraits");
    });
  }
  it("the card email links to the card, the try link and Don't email me cards, never the message", async () => {
    const p = previewProps("card-delivery");
    const out = await renderEmail("card-delivery", p);
    expect(out.subject).toBe("Sam sent you a Christmas card");
    expect(out.html).toContain(p.openUrl);
    expect(out.html).toContain(p.tryUrl);
    expect(out.html).toContain("Don&#x27;t email me cards");
  });
});

const SECRET = "whsec_" + Buffer.from("test-secret-0123456789abcdef0123").toString("base64");

function signed(payload: unknown, id = `msg_${randomBytes(6).toString("hex")}`) {
  const body = JSON.stringify(payload);
  const ts = new Date();
  const sig = new Webhook(SECRET).sign(id, ts, body);
  return { body, headers: new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": sig }), id };
}

async function makeCard(over: Record<string, unknown> = {}) {
  const v = (await db().from("theme_versions").select("id, theme_id").eq("status", "live").limit(1).single()).data as { id: string; theme_id: string };
  const r = await db()
    .from("cards")
    .insert({
      public_id: `C-${randomBytes(3).toString("hex")}`,
      share_slug: randomBytes(16).toString("base64url"),
      sender_email: "mailtest@example.com",
      from_name: "Sam",
      to_name: "Rose",
      recipient_email: `r${randomBytes(3).toString("hex")}@example.com`,
      message: "secret message text",
      theme_id: v.theme_id,
      version_id: v.id,
      delivery: "email",
      status: "ready",
      jpeg_path: "x.jpg",
      ...over,
    })
    .select("*")
    .single();
  if (r.error) throw r.error;
  return r.data as { id: string; public_id: string; recipient_email: string; share_slug: string };
}

describe("AgentMail webhook", () => {
  it("accepts a valid Svix signature and rejects a forged one", () => {
    const s = signed({ event_type: "message.delivered", delivery: { message_id: "m1" } });
    expect(verifySvix(SECRET, s.body, s.headers)?.event_type).toBe("message.delivered");
    expect(verifySvix(SECRET, s.body.replace("m1", "m2"), s.headers)).toBeNull();
    const other = "whsec_" + Buffer.from("another-secret-0123456789abcdef01").toString("base64");
    expect(verifySvix(other, s.body, s.headers)).toBeNull();
  });

  it("is idempotent on svix-id", async () => {
    const id = `msg_${randomBytes(6).toString("hex")}`;
    expect(await claimWebhook("agentmail", id, "message.delivered")).toBe(true);
    expect(await claimWebhook("agentmail", id, "message.delivered")).toBe(false);
  });

  it("a bounce marks the delivery bounced, the card failed and suppresses the address", async () => {
    const card = await makeCard({ status: "emailed" });
    const msgId = `am_${randomBytes(4).toString("hex")}`;
    await db().from("card_deliveries").insert({ card_id: card.id, type: "email", status: "sent", provider_message_id: msgId });
    await handleAgentMailEvent({ event_type: "message.bounced", bounce: { message_id: msgId, type: "Permanent", sub_type: "General", recipients: [{ address: card.recipient_email }] } });
    const d = (await db().from("card_deliveries").select("status").eq("provider_message_id", msgId).single()).data as { status: string };
    const c = (await db().from("cards").select("status").eq("id", card.id).single()).data as { status: string };
    const sup = await db().from("email_suppressions").select("scope, reason").eq("email", card.recipient_email);
    expect(d.status).toBe("bounced");
    expect(c.status).toBe("failed");
    expect(sup.data).toEqual([{ scope: "all", reason: "bounce" }]);
  });

  it("delivered and complained", async () => {
    const card = await makeCard({ status: "emailed" });
    const msgId = `am_${randomBytes(4).toString("hex")}`;
    await db().from("card_deliveries").insert({ card_id: card.id, type: "email", status: "sent", provider_message_id: msgId });
    await handleAgentMailEvent({ event_type: "message.delivered", delivery: { message_id: msgId, recipients: [card.recipient_email] } });
    expect(((await db().from("card_deliveries").select("status").eq("provider_message_id", msgId).single()).data as { status: string }).status).toBe("delivered");
    await handleAgentMailEvent({ event_type: "message.complained", complaint: { message_id: msgId, recipients: [card.recipient_email] } });
    expect((await db().from("email_suppressions").select("reason").eq("email", card.recipient_email)).data).toEqual([{ reason: "complaint" }]);
  });
});

describe("scheduled sending (cron, fake clock)", () => {
  beforeAll(async () => {
    await db().from("cards").update({ status: "cancelled" }).eq("status", "scheduled");
  });

  it("sends nothing early, sends once when due, and never twice", async () => {
    const at = new Date(Date.now() + 3600_000);
    const card = await makeCard({ status: "scheduled", scheduled_for: at.toISOString() });
    const before = readdirSync(outbox).length;
    expect((await sendDue(new Date(at.getTime() - 60_000))).scheduled).toBe(0);
    expect((await sendDue(new Date(at.getTime() + 60_000))).scheduled).toBe(1);
    expect((await sendDue(new Date(at.getTime() + 120_000))).scheduled).toBe(0);
    const c = (await db().from("cards").select("status").eq("id", card.id).single()).data as { status: string };
    expect(c.status).toBe("emailed");
    const files = readdirSync(outbox).slice(before);
    expect(files).toHaveLength(1);
    const mail = JSON.parse(readFileSync(path.join(outbox, files[0]), "utf8")) as { to: string; subject: string; html: string; from: string };
    expect(mail.to).toBe(card.recipient_email);
    expect(mail.subject).toContain("Sam sent you a");
    expect(mail.from).toBe("Sam via Magic Portraits <cards@magicportraitspartners.com>");
    expect(mail.html).toMatch(new RegExp(`/c/${card.share_slug}\\?d=[0-9a-f-]{36}`));
    expect(mail.html).not.toContain("secret message text");
    const sent = await db().from("activity_log").select("props").eq("event", "card_email_sent").eq("ref_id", card.public_id);
    expect(sent.data).toHaveLength(1);
  });

  it("suppressed recipients aren't emailed", async () => {
    const card = await makeCard({ status: "scheduled", scheduled_for: new Date(Date.now() - 1000).toISOString() });
    await db().from("email_suppressions").insert({ email: card.recipient_email, scope: "card_emails", reason: "unsubscribe" });
    const r = await sendDue(new Date());
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const d = await db().from("card_deliveries").select("status, error").eq("card_id", card.id);
    expect(d.data).toEqual([{ status: "failed", error: "suppressed" }]);
  });
});
