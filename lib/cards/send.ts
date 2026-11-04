import "server-only";
import { db, must } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { emailSender } from "@/lib/email";
import { renderEmail } from "@/lib/email/render";
import { getCardById, type CardRow } from "@/lib/db/cards";
import { track } from "@/lib/track";
import { maskEmail } from "@/lib/utils";

export async function isSuppressed(email: string, scopes: ("card_emails" | "all")[] = ["card_emails", "all"]): Promise<boolean> {
  const r = await db().from("email_suppressions").select("email").eq("email", email.toLowerCase()).in("scope", scopes).limit(1);
  return Boolean(r.data?.length);
}

async function themeName(card: CardRow): Promise<string> {
  if (!card.theme_id) return "greeting";
  const t = (await db().from("themes").select("name").eq("id", card.theme_id).single()).data as { name: string } | null;
  return t?.name ?? "greeting";
}

function senderFrom(template: string, fromName: string): string {
  return template.replaceAll("{from}", fromName.replace(/[<>"\r\n]/g, "").slice(0, 60));
}

/**
 * Emails a card to its recipient (first send, scheduled send or resend). Each email links to
 * /c/[slug]?d=<delivery id>; the first visit with that id counts as "opened".
 */
export async function sendCardEmail(cardId: string, type: "email" | "resend", opts: { deliveryId?: string; actor?: string } = {}): Promise<{ ok: boolean; reason?: string }> {
  const card = await getCardById(cardId);
  if (!card || !card.recipient_email || !card.jpeg_path) return { ok: false, reason: "not_ready" };
  if (card.status === "cancelled") return { ok: false, reason: "cancelled" };

  let deliveryId = opts.deliveryId;
  if (!deliveryId) {
    const existing = type === "email" ? ((await db().from("card_deliveries").select("id").eq("card_id", card.id).eq("type", "email").eq("status", "queued").limit(1)).data?.[0] as { id: string } | undefined) : undefined;
    deliveryId = existing?.id ?? (must(await db().from("card_deliveries").insert({ card_id: card.id, type, status: "queued" }).select("id").single(), "delivery") as { id: string }).id;
  }

  if (await isSuppressed(card.recipient_email)) {
    await db().from("card_deliveries").update({ status: "failed", error: "suppressed" }).eq("id", deliveryId);
    if (type === "email") await db().from("cards").update({ status: "failed", last_error: "recipient_suppressed" }).eq("id", card.id);
    return { ok: false, reason: "suppressed" };
  }

  const s = await getSettings(["email.from_cards", "email.reply_to"] as const);
  const base = env.appUrl;
  const theme = await themeName(card);
  const { subject, html, text } = await renderEmail("card-delivery", {
    appUrl: base,
    fromName: card.from_name,
    toName: card.to_name,
    themeName: theme,
    imageUrl: `${base}/c/${card.share_slug}/image`,
    openUrl: `${base}/c/${card.share_slug}?d=${deliveryId}`,
    tryUrl: `${base}/c/${card.share_slug}/try?via=email`,
    unsubscribeUrl: `${base}/c/${card.share_slug}/unsubscribe?d=${deliveryId}`,
  });
  const res = await emailSender().send({
    from: senderFrom(s["email.from_cards"], card.from_name),
    to: card.recipient_email,
    replyTo: s["email.reply_to"],
    subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${base}/c/${card.share_slug}/unsubscribe?d=${deliveryId}>` },
    idempotencyKey: `card-delivery-${deliveryId}`,
  });
  if (!res.ok) {
    console.error(`[email] card ${card.public_id} to ${maskEmail(card.recipient_email)} failed: ${res.error}`);
    await db().from("card_deliveries").update({ status: "failed", error: res.error }).eq("id", deliveryId);
    if (type === "email") await db().from("cards").update({ status: "failed", last_error: res.error }).eq("id", card.id);
    return { ok: false, reason: res.error };
  }
  await db().from("card_deliveries").update({ status: "sent", provider_message_id: res.messageId, error: null }).eq("id", deliveryId);
  if (card.status !== "opened") await db().from("cards").update({ status: "emailed", last_error: null }).eq("id", card.id);
  const props = { card_id: card.public_id, scheduled: Boolean(card.scheduled_for), theme_name: theme };
  if (type === "email") await track("card_email_sent", props, { email: card.sender_email, ref: { type: "card", id: card.public_id }, klaviyo: { dedupeKey: `card_email_sent:${card.id}` } });
  else
    await track("card_resent", { card_id: card.public_id }, { email: card.sender_email, ref: { type: "card", id: card.public_id }, actor: (opts.actor as `super_user:${string}` | undefined) ?? "customer" });
  return { ok: true };
}

/** Tells the sender their card is scheduled (AgentMail, at once). */
export async function sendScheduledConfirmation(card: CardRow): Promise<void> {
  if (!card.scheduled_for) return;
  const s = await getSettings(["email.from_system", "email.reply_to"] as const);
  const base = env.appUrl;
  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(card.scheduled_for));
  const { subject, html, text } = await renderEmail("card-scheduled", {
    appUrl: base,
    toName: card.to_name,
    whenText: `${when} (UTC)`,
    imageUrl: `${base}/c/${card.share_slug}/image`,
    manageUrl: `${base}/cards`,
  });
  const res = await emailSender().send({ from: s["email.from_system"], to: card.sender_email, replyTo: s["email.reply_to"], subject, html, text, idempotencyKey: `card-scheduled-${card.id}-${card.scheduled_for}` });
  if (!res.ok) console.error(`[email] scheduled confirmation for ${card.public_id} failed: ${res.error}`);
}

/**
 * Cron (every 5 minutes): sends scheduled cards whose time has come, and retries "email now"
 * deliveries that are still queued after a minute.
 */
export async function sendDue(now = new Date()): Promise<{ scheduled: number; retried: number; failed: number }> {
  let scheduled = 0;
  let retried = 0;
  let failed = 0;
  const due = await db().from("cards").select("id").eq("status", "scheduled").lte("scheduled_for", now.toISOString()).order("scheduled_for").limit(200);
  for (const c of (due.data ?? []) as { id: string }[]) {
    // Claim it first so two cron runs never send twice.
    const claim = await db().from("cards").update({ status: "ready" }).eq("id", c.id).eq("status", "scheduled").select("id");
    if (!claim.data?.length) continue;
    const r = await sendCardEmail(c.id, "email");
    if (r.ok) scheduled++;
    else failed++;
  }
  const stale = await db()
    .from("card_deliveries")
    .select("id, card_id")
    .eq("type", "email")
    .eq("status", "queued")
    .lte("created_at", new Date(now.getTime() - 60_000).toISOString())
    .limit(200);
  for (const d of (stale.data ?? []) as { id: string; card_id: string }[]) {
    const card = await getCardById(d.card_id);
    if (!card || card.status === "scheduled" || card.status === "cancelled") continue;
    const r = await sendCardEmail(d.card_id, "email", { deliveryId: d.id });
    if (r.ok) retried++;
    else failed++;
  }
  return { scheduled, retried, failed };
}
