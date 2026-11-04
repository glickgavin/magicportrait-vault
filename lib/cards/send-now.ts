import "server-only";
import { db } from "@/lib/db/client";
import { getOwnedCard } from "@/lib/db/cards";
import { getSettings } from "@/lib/settings";
import { hashKey, rateLimit } from "@/lib/auth/http";
import { emailSchema } from "@/lib/auth/schemas";
import { isSuppressed, sendCardEmail } from "./send";

export type SendNowResult = { ok: true; resent: boolean } | { ok: false; error: "not_found" | "not_allowed" | "paused" | "invalid_email" | "already_sent" | "rate_limited" | "suppressed" | "send_failed"; status: number };

/** Per signed-in person per day, shared by Send and Resend (`cards.email_sends_per_day`). */
export async function underDailySendLimit(senderEmail: string): Promise<boolean> {
  const s = await getSettings(["cards.email_sends_per_day"] as const);
  return rateLimit(`card-email:${hashKey(senderEmail)}`, s["cards.email_sends_per_day"], 86_400);
}

/**
 * Ready screen "Send": emails a finished card to one recipient at once. One recipient per card:
 * the same address again is a resend; a different one is refused. Re-checks ownership on the server.
 */
export async function sendCardNow(senderEmail: string, cardRef: string, rawRecipient: unknown): Promise<SendNowResult> {
  const card = await getOwnedCard(senderEmail, cardRef);
  if (!card) return { ok: false, error: "not_found", status: 404 };
  if (!card.jpeg_path || !["ready", "emailed", "opened", "failed"].includes(card.status)) return { ok: false, error: "not_allowed", status: 409 };
  const s = await getSettings(["cards.enabled"] as const);
  if (!s["cards.enabled"]) return { ok: false, error: "paused", status: 409 };
  const parsed = emailSchema.safeParse(rawRecipient);
  if (!parsed.success) return { ok: false, error: "invalid_email", status: 400 };
  const recipient = parsed.data.toLowerCase();
  if (card.recipient_email && card.recipient_email !== recipient) return { ok: false, error: "already_sent", status: 409 };
  if (!(await underDailySendLimit(senderEmail))) return { ok: false, error: "rate_limited", status: 429 };
  if (await isSuppressed(recipient)) return { ok: false, error: "suppressed", status: 409 };

  const resend = Boolean(card.recipient_email) && card.status !== "ready" && card.status !== "failed";
  if (!card.recipient_email) {
    // Claim the card for this recipient (a race with another tab can't attach a second address).
    const claimed = await db().from("cards").update({ delivery: "email", recipient_email: recipient }).eq("id", card.id).is("recipient_email", null).select("id");
    if (!claimed.data?.length) return { ok: false, error: "already_sent", status: 409 };
  }
  const r = await sendCardEmail(card.id, resend ? "resend" : "email");
  if (!r.ok) return { ok: false, error: r.reason === "suppressed" ? "suppressed" : "send_failed", status: r.reason === "suppressed" ? 409 : 502 };
  return { ok: true, resent: resend };
}
