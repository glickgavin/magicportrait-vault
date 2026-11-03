import "server-only";
import { db } from "@/lib/db/client";
import { getCardBySlug } from "@/lib/db/cards";
import { track } from "@/lib/track";

/** The recipient behind a delivery link (never shown in the page or the URL). */
export async function recipientFor(slug: string, deliveryId: string): Promise<{ cardPublicId: string; senderEmail: string; recipient: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) return null;
  const card = await getCardBySlug(slug);
  if (!card?.recipient_email) return null;
  const d = await db().from("card_deliveries").select("id").eq("id", deliveryId).eq("card_id", card.id).maybeSingle();
  if (!d.data) return null;
  return { cardPublicId: card.public_id, senderEmail: card.sender_email, recipient: card.recipient_email };
}

export async function unsubscribeRecipient(slug: string, deliveryId: string): Promise<boolean> {
  const r = await recipientFor(slug, deliveryId);
  if (!r) return false;
  await db().from("email_suppressions").upsert({ email: r.recipient, scope: "card_emails", reason: "unsubscribe" }, { onConflict: "email,scope", ignoreDuplicates: true });
  await track("card_recipient_unsubscribed", { card_id: r.cardPublicId }, { email: r.senderEmail, actor: "recipient", ref: { type: "card", id: r.cardPublicId } });
  return true;
}
