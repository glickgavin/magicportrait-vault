import { getSessionUser } from "@/lib/auth/session";
import { hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { getOwnedCard } from "@/lib/db/cards";
import { sendCardEmail } from "@/lib/cards/send";
import { underDailySendLimit } from "@/lib/cards/send-now";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const card = await getOwnedCard(user.email, (await ctx.params).id);
  if (!card) return notFoundJson();
  if (card.delivery !== "email" || !card.recipient_email || !["emailed", "opened", "failed"].includes(card.status)) return json({ error: "not_allowed" }, 409);
  if (!(await rateLimit(`resend:${hashKey(card.id)}`, 3, 3600)) || !(await underDailySendLimit(user.email))) return json({ error: "rate_limited" }, 429);
  const r = await sendCardEmail(card.id, "resend");
  return r.ok ? json({ ok: true }) : json({ error: r.reason === "suppressed" ? "suppressed" : "send_failed" }, r.reason === "suppressed" ? 409 : 502);
}
