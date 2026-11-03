import "server-only";
import { db } from "@/lib/db/client";
import { getCardBySlug, type CardRow } from "@/lib/db/cards";
import { track } from "@/lib/track";

/** First visit with ?d=<delivery id>: the recipient opened the card from its email (SPEC D19). */
export async function markOpenedFromEmail(card: CardRow, deliveryId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) return;
  const now = new Date().toISOString();
  const r = await db()
    .from("card_deliveries")
    .update({ status: "opened", opened_at: now })
    .eq("id", deliveryId)
    .eq("card_id", card.id)
    .in("type", ["email", "resend"])
    .is("opened_at", null)
    .select("id");
  if (!r.data?.length) return; // unknown, another card's, or already opened
  if (card.status === "emailed" || card.status === "ready") await db().from("cards").update({ status: "opened" }).eq("id", card.id);
  await track("card_recipient_email_opened", { card_id: card.public_id }, { email: card.sender_email, actor: "recipient", ref: { type: "card", id: card.public_id } });
}

export async function publicCard(slug: string): Promise<CardRow | null> {
  const c = await getCardBySlug(slug);
  if (!c || !c.jpeg_path || c.status === "rendering" || c.status === "failed") return null;
  return c;
}
