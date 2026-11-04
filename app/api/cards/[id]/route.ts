import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { editScheduledCard } from "@/lib/cards/edit";
import { cardErrorResponse } from "@/lib/cards/errors";

export const dynamic = "force-dynamic";

/** Change a scheduled card. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  try {
    const card = await editScheduledCard(user.email, (await ctx.params).id, await req.json().catch(() => null));
    return json({ id: card.id, publicId: card.public_id, firstCard: false });
  } catch (e) {
    return cardErrorResponse(e);
  }
}
