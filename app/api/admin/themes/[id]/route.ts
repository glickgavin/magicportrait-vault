import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const mmdd = z.string().regex(/^\d{2}-\d{2}$/).nullable();
const body = z.object({ name: z.string().trim().min(1).max(60), status: z.enum(["draft", "live", "archived"]), from: mmdd, to: mmdd, sortOrder: z.number().int(), categoryId: z.string().uuid() }).partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const d = p.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.status !== undefined) patch.status = d.status;
  if (d.from !== undefined) patch.available_from = d.from ? `2026-${d.from}` : null;
  if (d.to !== undefined) patch.available_to = d.to ? `2026-${d.to}` : null;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
  if (d.categoryId !== undefined) patch.category_id = d.categoryId;
  const r = await db().from("themes").update(patch).eq("id", (await ctx.params).id).select("slug").single();
  if (r.error) return json({ error: "Couldn't save." }, 400);
  await track("admin_theme_updated", { theme_slug: (r.data as { slug: string }).slug, fields: Object.keys(patch).join(",") }, { email: u.email, actor: actorOf(u), ref: { type: "theme", id: (r.data as { slug: string }).slug } });
  return json({ ok: true });
}
