import "server-only";
import { Webhook } from "svix";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

type Raw = {
  event_type?: string;
  event_id?: string;
  delivery?: { message_id?: string; recipients?: string[] };
  bounce?: { message_id?: string; type?: string; sub_type?: string; recipients?: ({ address?: string } | string)[] };
  complaint?: { message_id?: string; recipients?: string[] };
};

export function verifySvix(secret: string, body: string, headers: Headers): Raw | null {
  try {
    // Throws when the signature or timestamp is wrong.
    new Webhook(secret).verify(body, {
      "svix-id": headers.get("svix-id") ?? "",
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    });
    return JSON.parse(body) as Raw;
  } catch {
    return null;
  }
}

/** First time we see this webhook id? (idempotency) */
export async function claimWebhook(source: "shopify" | "agentmail", id: string, topic: string | null): Promise<boolean> {
  const r = await db().from("processed_webhooks").insert({ source, webhook_id: id, topic });
  if (!r.error) return true;
  if (r.error.code === "23505") return false;
  throw new Error(r.error.message);
}

const addr = (r: { address?: string } | string) => (typeof r === "string" ? r : (r.address ?? "")).toLowerCase();

/** message.delivered / message.bounced / message.complained → deliveries, card status, suppressions. */
export async function handleAgentMailEvent(e: Raw): Promise<{ handled: string }> {
  const type = e.event_type ?? "";
  const messageId = e.delivery?.message_id ?? e.bounce?.message_id ?? e.complaint?.message_id;
  if (!messageId) return { handled: "ignored" };
  const offer = (await db().from("gift_offers").select("id, email, shopify_order_id, email_status").eq("provider_message_id", messageId).maybeSingle()).data as { id: string; email: string; shopify_order_id: string; email_status: string | null } | null;
  if (offer) return handleOfferEvent(type, e, offer);
  const d = (await db().from("card_deliveries").select("id, card_id, status, type").eq("provider_message_id", messageId).maybeSingle()).data as { id: string; card_id: string; status: string; type: string } | null;
  const card = d ? ((await db().from("cards").select("id, public_id, sender_email, recipient_email, status").eq("id", d.card_id).single()).data as { id: string; public_id: string; sender_email: string; recipient_email: string | null; status: string } | null) : null;

  if (type === "message.delivered") {
    if (d && d.status === "sent") await db().from("card_deliveries").update({ status: "delivered" }).eq("id", d.id);
    return { handled: "delivered" };
  }
  if (type === "message.bounced") {
    const recipients = (e.bounce?.recipients ?? []).map(addr).filter(Boolean);
    const permanent = (e.bounce?.type ?? "").toLowerCase() !== "transient";
    if (d) await db().from("card_deliveries").update({ status: "bounced", error: `${e.bounce?.type ?? ""}/${e.bounce?.sub_type ?? ""}`.slice(0, 120) }).eq("id", d.id);
    if (card && permanent && card.status !== "opened") await db().from("cards").update({ status: "failed", last_error: "bounced" }).eq("id", card.id);
    if (permanent) for (const r of recipients.length ? recipients : card?.recipient_email ? [card.recipient_email] : []) await db().from("email_suppressions").upsert({ email: r, scope: "all", reason: "bounce" }, { onConflict: "email,scope", ignoreDuplicates: true });
    if (card) await track("card_recipient_email_bounced", { card_id: card.public_id, permanent }, { email: card.sender_email, source: "email", actor: "system", ref: { type: "card", id: card.public_id } });
    return { handled: "bounced" };
  }
  if (type === "message.complained") {
    const recipients = (e.complaint?.recipients ?? []).map(addr).filter(Boolean);
    for (const r of recipients.length ? recipients : card?.recipient_email ? [card.recipient_email] : []) await db().from("email_suppressions").upsert({ email: r, scope: "all", reason: "complaint" }, { onConflict: "email,scope", ignoreDuplicates: true });
    return { handled: "complained" };
  }
  return { handled: "ignored" };
}

/** Delivery events for the free gift offer email (gift_offers.provider_message_id). */
async function handleOfferEvent(type: string, e: Raw, offer: { id: string; email: string; shopify_order_id: string; email_status: string | null }): Promise<{ handled: string }> {
  const ref = { type: "order" as const, id: offer.shopify_order_id };
  if (type === "message.delivered") {
    await db().from("gift_offers").update({ email_status: "delivered", delivered_at: new Date().toISOString() }).eq("id", offer.id).eq("email_status", "sent");
    return { handled: "offer_delivered" };
  }
  if (type === "message.bounced" || type === "message.complained") {
    const permanent = type === "message.complained" || (e.bounce?.type ?? "").toLowerCase() !== "transient";
    await db().from("gift_offers").update({ email_status: type === "message.bounced" ? "bounced" : "complained", email_error: `${e.bounce?.type ?? "complaint"}/${e.bounce?.sub_type ?? ""}`.slice(0, 120) }).eq("id", offer.id);
    if (permanent) await db().from("email_suppressions").upsert({ email: offer.email, scope: "all", reason: type === "message.bounced" ? "bounce" : "complaint" }, { onConflict: "email,scope", ignoreDuplicates: true });
    await track("gift_offer_email_bounced", { order_id: offer.shopify_order_id, permanent }, { email: offer.email, source: "email", actor: "system", ref });
    return { handled: type === "message.bounced" ? "offer_bounced" : "offer_complained" };
  }
  return { handled: "ignored" };
}
