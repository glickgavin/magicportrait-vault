import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** Hide or show a card's share link. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = z.object({ hidden: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const r = await db().from("cards").update({ share_hidden: p.data.hidden }).eq("id", (await ctx.params).id).select("public_id").single();
  if (r.error) return json({ error: "not_found" }, 404);
  const pid = (r.data as { public_id: string }).public_id;
  await track(p.data.hidden ? "admin_card_share_hidden" : "admin_card_share_shown", { card_id: pid }, { email: u.email, actor: actorOf(u), ref: { type: "card", id: pid } });
  return json({ ok: true });
}
