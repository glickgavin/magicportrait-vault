import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getCardById } from "@/lib/db/cards";
import { sendCardEmail } from "@/lib/cards/send";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const card = await getCardById((await ctx.params).id);
  if (!card) return json({ error: "not_found" }, 404);
  if (!card.recipient_email) return json({ error: "This card wasn't emailed." }, 409);
  const r = await sendCardEmail(card.id, "resend", { actor: actorOf(u) });
  if (!r.ok) return json({ error: r.reason === "suppressed" ? "The recipient has blocked card emails." : "Couldn't send." }, 409);
  await track("admin_card_resent", { card_id: card.public_id }, { email: u.email, actor: actorOf(u), ref: { type: "card", id: card.public_id } });
  return json({ ok: true });
}
