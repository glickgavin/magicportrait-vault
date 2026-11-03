import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const mmdd = z.string().regex(/^\d{2}-\d{2}$/).nullable().optional();
const body = z.object({ name: z.string().trim().min(1).max(60), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), categoryId: z.string().uuid(), from: mmdd, to: mmdd });

export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Check the name, slug (a-z, 0-9, -) and dates (MM-DD)." }, 400);
  const r = await db()
    .from("themes")
    .insert({ name: p.data.name, slug: p.data.slug, category_id: p.data.categoryId, available_from: p.data.from ? `2026-${p.data.from}` : null, available_to: p.data.to ? `2026-${p.data.to}` : null, repeats_yearly: true, status: "draft", sort_order: 99 })
    .select("id")
    .single();
  if (r.error) return json({ error: r.error.code === "23505" ? "That slug is taken." : "Couldn't create the theme." }, 400);
  await track("admin_theme_created", { theme_slug: p.data.slug }, { email: u.email, actor: actorOf(u), ref: { type: "theme", id: p.data.slug } });
  return json({ id: (r.data as { id: string }).id });
}
