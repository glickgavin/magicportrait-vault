import "server-only";
import type { CardRow } from "@/lib/db/cards";
import { countCardsBySender } from "@/lib/db/cards";
import { sendCardEmail, sendScheduledConfirmation } from "./send";
import { queueProfileUpdate } from "@/lib/klaviyo";

/** Runs once a card's JPEG exists: email it now, or confirm the schedule to the sender. */
export async function afterCardReady(card: CardRow): Promise<void> {
  if (card.delivery === "email" && card.status === "ready") await sendCardEmail(card.id, "email");
  if (card.delivery === "email" && card.status === "scheduled") await sendScheduledConfirmation(card);
  await queueProfileUpdate(card.sender_email, { "My MP Cards Created": await countCardsBySender(card.sender_email), "My MP Last Card At": card.created_at }).catch(() => null);
}
