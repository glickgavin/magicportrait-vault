import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { putObject } from "@/lib/storage";
import { checkArtwork } from "@/lib/admin/artwork";
import { getSetting } from "@/lib/settings";
import { themeAssetUrl } from "@/lib/render/assets";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** Upload a background or overlay, checked before it's stored (size, sRGB, under 2 MB, overlay transparency). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const id = (await ctx.params).id;
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if ((kind !== "background" && kind !== "overlay") || !(file instanceof File)) return json({ error: "Choose a file." }, 400);
  if (file.size > 10 * 1024 * 1024) return json({ errors: ["Must be under 2 MB"] }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  const check = await checkArtwork(buf, kind, await getSetting("cards.size_px"));
  if (!check.ok) return json({ errors: check.errors }, 400);
  const v = (await db().from("theme_versions").select("slug, theme_id").eq("id", id).single()).data as { slug: string; theme_id: string } | null;
  if (!v) return json({ error: "No such version." }, 404);
  const t = (await db().from("themes").select("slug").eq("id", v.theme_id).single()).data as { slug: string };
  const ext = check.format === "png" ? "png" : "jpg";
  const key = `${t.slug}/${v.slug}/${kind}-${Date.now()}.${ext}`;
  await putObject("theme-assets", key, buf, ext === "png" ? "image/png" : "image/jpeg");
  await db().from("theme_versions").update(kind === "background" ? { background_path: key } : { overlay_path: key }).eq("id", id);
  await track("admin_version_updated", { version_slug: `${t.slug}-${v.slug}`, fields: kind }, { email: u.email, actor: actorOf(u), ref: { type: "version", id } });
  return json({ ok: true, path: key, url: themeAssetUrl(key), width: check.width, height: check.height, bytes: check.bytes, format: check.format });
}
