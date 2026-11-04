import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { setThemeLive } from "@/lib/admin/themes";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ live: z.boolean() });

/** Theme library switch: on publishes every draft version and makes the theme live; off hides the theme. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const id = (await ctx.params).id;
  if (!z.uuid().safeParse(id).success) return json({ error: "not_found" }, 404);
  try {
    const r = await setThemeLive(id, p.data.live);
    const who = { email: u.email, actor: actorOf(u) };
    for (const v of r.published) await track("admin_version_published", { version_slug: `${r.slug}-${v.slug}` }, { ...who, ref: { type: "version", id: v.id } });
    await track("admin_theme_updated", { theme_slug: r.slug, fields: "status" }, { ...who, ref: { type: "theme", id: r.slug } });
    return json({ ok: true, published: r.published.length, ...(r.failed.length ? { warning: `Theme is live, but these versions couldn't be published: ${r.failed.join(", ")}. Open them in the editor.` } : {}) });
  } catch (e) {
    return json({ error: `Couldn't update: ${(e as Error).message.slice(0, 120)}` }, 500);
  }
}
