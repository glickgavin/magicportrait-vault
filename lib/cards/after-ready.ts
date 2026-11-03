import "server-only";
import type { CardRow } from "@/lib/db/cards";

/** Hook run once a card's JPEG exists. Part 7 sends "email now" cards from here. */
export async function afterCardReady(card: CardRow): Promise<void> {
  void card;
}
