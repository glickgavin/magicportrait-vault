import { getSessionUser } from "@/lib/auth/session";
import { json, notFoundJson } from "@/lib/auth/http";
import { getOwnedCard } from "@/lib/db/cards";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** Cancels a scheduled card until it goes out. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const card = await getOwnedCard(user.email, (await ctx.params).id);
  if (!card) return notFoundJson();
  const r = await db().from("cards").update({ status: "cancelled" }).eq("id", card.id).eq("status", "scheduled").select("id");
  if (!r.data?.length) return json({ error: "not_scheduled" }, 409);
  await track("card_cancelled", { card_id: card.public_id }, { email: user.email, ref: { type: "card", id: card.public_id } });
  return json({ ok: true });
}
