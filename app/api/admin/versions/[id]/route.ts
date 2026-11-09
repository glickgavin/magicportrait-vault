import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { layoutSchema } from "@/lib/render/layout";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const body = z
  .object({
    name: z.string().trim().min(1).max(60),
    isNew: z.boolean(),
    status: z.enum(["draft", "archived"]),
    sortOrder: z.number().int(),
    layout: layoutSchema,
    messageIdeas: z.array(z.string().trim().min(1).max(400)).max(12),
    messageMaxChars: z.number().int().min(20).max(1000).nullable(),
    /** Template editor "Remove overlay": the design goes back to no overlay (the stored file is kept). */
    removeOverlay: z.literal(true),
    /** "Remove placeholder image": back to the built-in sample portrait. */
    removeSample: z.literal(true),
  })
  .partial();

/** Edit a version. Going live only happens through "Publish version" (which also makes the thumbnail). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  const d = p.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.isNew !== undefined) patch.is_new = d.isNew;
  if (d.status !== undefined) patch.status = d.status;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
  if (d.layout !== undefined) patch.layout = d.layout;
  if (d.messageIdeas !== undefined) patch.message_ideas = d.messageIdeas;
  if (d.messageMaxChars !== undefined) patch.message_max_chars = d.messageMaxChars;
  if (d.removeOverlay) patch.overlay_path = null;
  if (d.removeSample) patch.sample_portrait_path = null;
  const id = (await ctx.params).id;
  const r = await db().from("theme_versions").update(patch).eq("id", id).select("slug, theme_id").single();
  if (r.error) return json({ error: "Couldn't save." }, 400);
  const v = r.data as { slug: string; theme_id: string };
  const t = (await db().from("themes").select("slug").eq("id", v.theme_id).single()).data as { slug: string };
  const event = d.status === "archived" ? "admin_version_archived" : "admin_version_updated";
  await track(event, { version_slug: `${t.slug}-${v.slug}`, fields: Object.keys(patch).join(",") }, { email: u.email, actor: actorOf(u), ref: { type: "version", id } });
  return json({ ok: true });
}
