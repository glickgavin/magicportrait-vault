import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const body = z.object({ name: z.string().trim().min(1).max(40), reminderEnabled: z.boolean(), sortOrder: z.number().int() }).partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const patch: Record<string, unknown> = {};
  if (p.data.name !== undefined) patch.name = p.data.name;
  if (p.data.reminderEnabled !== undefined) patch.reminder_enabled = p.data.reminderEnabled;
  if (p.data.sortOrder !== undefined) patch.sort_order = p.data.sortOrder;
  const r = await db().from("theme_categories").update(patch).eq("id", (await ctx.params).id).select("slug").single();
  if (r.error) return json({ error: "Couldn't save." }, 400);
  await track("admin_category_updated", { category: (r.data as { slug: string }).slug }, { email: u.email, actor: actorOf(u), ref: { type: "category", id: (r.data as { slug: string }).slug } });
  return json({ ok: true });
}
