import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { deleteOneCard } from "@/lib/admin/cards";
import { getCardById } from "@/lib/db/cards";

export const dynamic = "force-dynamic";

/** Delete one card on request. The body repeats the card id (C-xxxxxx) as confirmation. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const card = await getCardById((await ctx.params).id);
  if (!card) return json({ error: "not_found" }, 404);
  const p = z.object({ confirm: z.string() }).safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.confirm.trim() !== card.public_id) return json({ error: "Type the card id to confirm." }, 400);
  await deleteOneCard(card.id, u.email);
  return json({ ok: true });
}
