import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { publishVersion } from "@/lib/admin/themes";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Publish version": makes the thumbnail and sets the version live (its theme must be live to show). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  try {
    const v = await publishVersion((await ctx.params).id);
    const t = (await db().from("themes").select("slug, status").eq("id", v.theme_id).single()).data as { slug: string; status: string };
    await track("admin_version_published", { version_slug: `${t.slug}-${v.slug}` }, { email: u.email, actor: actorOf(u), ref: { type: "version", id: v.id } });
    return json({ ok: true, themeLive: t.status === "live" });
  } catch (e) {
    return json({ error: `Couldn't publish: ${(e as Error).message.slice(0, 120)}` }, 500);
  }
}
