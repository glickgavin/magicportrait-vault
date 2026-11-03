import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";
import { defaultLayout } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

const body = z.object({ themeId: z.string().uuid(), name: z.string().trim().min(1).max(60), slug: z.string().regex(/^[a-z0-9-]{2,40}$/) });

/** A new draft version: starts from the theme's first version's artwork and layout (or the default layout). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Check the name and slug (a-z, 0-9, -)." }, 400);
  const base = (await db().from("theme_versions").select("background_path, overlay_path, layout, message_ideas").eq("theme_id", p.data.themeId).order("sort_order").limit(1).maybeSingle()).data as { background_path: string; overlay_path: string | null; layout: unknown; message_ideas: string[] } | null;
  const t = (await db().from("themes").select("slug").eq("id", p.data.themeId).single()).data as { slug: string } | null;
  if (!t) return json({ error: "No such theme." }, 404);
  const r = await db()
    .from("theme_versions")
    .insert({
      theme_id: p.data.themeId,
      name: p.data.name,
      slug: p.data.slug,
      status: "draft",
      sort_order: 99,
      background_path: base?.background_path ?? "builtin:with-love-love.jpg",
      overlay_path: base?.overlay_path ?? null,
      layout: base?.layout ?? defaultLayout({ bg: "#FFFFFF", ink: "#2B2B2B", accent: "#B8059F", photoBg: "#E8E2D8", frame: "#FFFFFF", headline: "", sub: "", decor: "hearts" }),
      message_ideas: base?.message_ideas ?? [],
    })
    .select("id")
    .single();
  if (r.error) return json({ error: r.error.code === "23505" ? "That slug is taken for this theme." : "Couldn't create the version." }, 400);
  await track("admin_version_updated", { version_slug: `${t.slug}-${p.data.slug}`, created: true }, { email: u.email, actor: actorOf(u), ref: { type: "version", id: (r.data as { id: string }).id } });
  return json({ id: (r.data as { id: string }).id });
}
