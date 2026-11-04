import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { adminCardDetail } from "@/lib/admin/cards";

export const dynamic = "force-dynamic";

/** Card detail for support. Opening it is logged as admin_card_viewed. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const d = await adminCardDetail((await ctx.params).id, u.email);
  return d ? json(d) : json({ error: "not_found" }, 404);
}
