import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { createCard } from "@/lib/cards/create";
import { cardErrorResponse } from "@/lib/cards/errors";

export const dynamic = "force-dynamic";

/** Creates a card row (status "rendering"). The Creating screen then calls /api/cards/[id]/render. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  try {
    const { card, firstCard } = await createCard(user.email, await req.json().catch(() => null));
    return json({ id: card.id, publicId: card.public_id, firstCard }, 201);
  } catch (e) {
    return cardErrorResponse(e);
  }
}
