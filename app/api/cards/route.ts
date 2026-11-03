import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { json } from "@/lib/auth/http";
import { CardError, createCard } from "@/lib/cards/create";

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

export function cardErrorResponse(e: unknown) {
  if (e instanceof ZodError) return json({ error: "invalid", fields: e.issues.map((i) => i.path.join(".")) }, 400);
  if (e instanceof CardError) return json({ error: e.code, ...e.extra }, e.status);
  console.error(`[cards] ${(e as Error).message}`);
  return json({ error: "server_error" }, 500);
}
