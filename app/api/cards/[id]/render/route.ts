import { getSessionUser } from "@/lib/auth/session";
import { json, notFoundJson } from "@/lib/auth/http";
import { getOwnedCard } from "@/lib/db/cards";
import { renderCard, CardError } from "@/lib/cards/create";
import { afterCardReady } from "@/lib/cards/after-ready";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const card = await getOwnedCard(user.email, (await ctx.params).id);
  if (!card) return notFoundJson();
  const body = (await req.json().catch(() => ({}))) as { firstCard?: boolean };
  if (card.status !== "rendering" && card.status !== "failed") return json({ status: card.status, publicId: card.public_id });
  try {
    const done = await renderCard(card.id, { firstCard: body.firstCard, isRetry: card.status === "failed" });
    await afterCardReady(done);
    return json({ status: done.status, publicId: done.public_id });
  } catch (e) {
    return json({ error: e instanceof CardError ? e.code : "render_failed", status: "failed" }, 500);
  }
}
