import sharp, { type Metadata } from "sharp";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { db } from "@/lib/db/client";
import { putObject } from "@/lib/storage";
import { checkArtwork, prepareArtwork } from "@/lib/admin/artwork";
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
  if ((kind !== "background" && kind !== "overlay" && kind !== "sample") || !(file instanceof File)) return json({ error: "Choose a file." }, 400);
  if (file.size > 20 * 1024 * 1024) return json({ errors: ["Must be under 20 MB before compression"] }, 400);
  if (kind === "sample") return uploadSample(id, Buffer.from(await file.arrayBuffer()), u);
  const size = await getSetting("cards.size_px");
  const prepared = await prepareArtwork(Buffer.from(await file.arrayBuffer()), kind, size);
  if (prepared.error) return json({ errors: [prepared.error] }, 400);
  const buf = prepared.buf;
  // Overlays may be up to 4 MB after compression (large transparent art); backgrounds stay under 2 MB.
  const check = await checkArtwork(buf, kind, size, (kind === "overlay" ? 4 : 2) * 1024 * 1024);
  if (!check.ok) return json({ errors: check.errors }, 400);
  const v = (await db().from("theme_versions").select("slug, theme_id").eq("id", id).single()).data as { slug: string; theme_id: string } | null;
  if (!v) return json({ error: "No such version." }, 404);
  const t = (await db().from("themes").select("slug").eq("id", v.theme_id).single()).data as { slug: string };
  const ext = check.format === "png" ? "png" : "jpg";
  const key = `${t.slug}/${v.slug}/${kind}-${Date.now()}.${ext}`;
  await putObject("theme-assets", key, buf, ext === "png" ? "image/png" : "image/jpeg");
  await db().from("theme_versions").update(kind === "background" ? { background_path: key } : { overlay_path: key }).eq("id", id);
  await track("admin_version_updated", { version_slug: `${t.slug}-${v.slug}`, fields: kind }, { email: u.email, actor: actorOf(u), ref: { type: "version", id } });
  return json({ ok: true, path: key, url: themeAssetUrl(key), width: check.width, height: check.height, bytes: check.bytes, format: check.format, notes: prepared.notes });
}

/**
 * The design's own placeholder portrait (editor preview, test render, published thumbnail). Any JPEG
 * or PNG photo; stored as a web-sized JPEG (longest side 1200 px), keeping its own shape.
 */
async function uploadSample(id: string, input: Buffer, u: Exclude<Awaited<ReturnType<typeof adminOr404>>, Response>) {
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return json({ errors: ["Not an image we can read"] }, 400);
  }
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) return json({ errors: ["Placeholder image must be a JPEG, PNG or WebP"] }, 400);
  if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) return json({ errors: ["Placeholder image must be at least 300 × 300 px"] }, 400);
  const buf = await sharp(input).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const out = await sharp(buf).metadata();
  const v = (await db().from("theme_versions").select("slug, theme_id").eq("id", id).single()).data as { slug: string; theme_id: string } | null;
  if (!v) return json({ error: "No such version." }, 404);
  const t = (await db().from("themes").select("slug").eq("id", v.theme_id).single()).data as { slug: string };
  const key = `${t.slug}/${v.slug}/sample-${Date.now()}.jpg`;
  await putObject("theme-assets", key, buf, "image/jpeg");
  await db().from("theme_versions").update({ sample_portrait_path: key }).eq("id", id);
  await track("admin_version_updated", { version_slug: `${t.slug}-${v.slug}`, fields: "sample_portrait" }, { email: u.email, actor: actorOf(u), ref: { type: "version", id } });
  return json({ ok: true, path: key, url: themeAssetUrl(key), width: out.width, height: out.height, bytes: buf.length, format: "jpeg", notes: [] });
}
