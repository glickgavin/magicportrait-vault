import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { putObject } from "@/lib/storage";

/**
 * Template photos uploaded in Settings › Shop › Preview template. Blank product photos are not private,
 * so they live in the public theme-assets bucket under shop-templates/<product id>/ (never in Shopify:
 * the app writes only mmp_shop fields). The size is kept in the file name: <random>-<w>x<h>.<ext>.
 */
export const TEMPLATE_FOLDER = "shop-templates";

export type TemplateMedia = { id: string; url: string; alt: string | null; width: number; height: number };
export type TemplateUploadKind = "background" | "overlay";
export type TemplateUploadRefusal = "not_an_image" | "too_small" | "too_large" | "overlay_not_see_through";

const NAME = /^[a-f0-9]{16}-(\d{2,5})x(\d{2,5})\.(jpg|webp)$/;

function publicBase(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/theme-assets/${TEMPLATE_FOLDER}/`;
}

/** True for a link to one of the photos uploaded here (any product). */
export function isUploadedTemplateUrl(url: string): boolean {
  const base = publicBase();
  return base.startsWith("https://") && url.startsWith(base) && !url.slice(base.length).includes("..");
}

/** The uploaded photos for one product (Shopify's numeric id), newest first. */
export async function uploadedTemplateMedia(productLegacyId: string): Promise<TemplateMedia[]> {
  if (!/^\d{1,20}$/.test(productLegacyId)) return [];
  const { data, error } = await db().storage.from("theme-assets").list(`${TEMPLATE_FOLDER}/${productLegacyId}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) return [];
  return data.flatMap((f) => {
    const m = NAME.exec(f.name);
    if (!m) return [];
    const url = `${publicBase()}${productLegacyId}/${f.name}`;
    return [{ id: `upload:${productLegacyId}/${f.name}`, url, alt: m[3] === "webp" ? "Uploaded overlay" : "Uploaded photo", width: Number(m[1]), height: Number(m[2]) }];
  });
}

/**
 * Checks and cleans an upload. Photos become JPEG (no see-through parts); overlays become WebP and must
 * have see-through pixels, or they'd cover the customer's picture. Both are scaled to the longest side kept.
 */
export async function processTemplateUpload(
  body: Buffer,
  kind: TemplateUploadKind,
  opts: { maxPx: number },
): Promise<{ ok: true; body: Buffer; contentType: string; ext: "jpg" | "webp"; width: number; height: number } | { ok: false; reason: TemplateUploadRefusal }> {
  const sharp = (await import("sharp")).default;
  let meta;
  try {
    meta = await sharp(body).metadata();
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
  if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format ?? "")) return { ok: false, reason: "not_an_image" };
  if (Math.min(meta.width, meta.height) < 400) return { ok: false, reason: "too_small" };
  const base = sharp(body).rotate().resize({ width: opts.maxPx, height: opts.maxPx, fit: "inside", withoutEnlargement: true });
  if (kind === "overlay") {
    if (!meta.hasAlpha) return { ok: false, reason: "overlay_not_see_through" };
    const { data, info } = await base.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear++;
    if (clear / (info.width * info.height) < 0.02) return { ok: false, reason: "overlay_not_see_through" };
    const out = await base.webp({ quality: 90, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
    return { ok: true, body: out.data, contentType: "image/webp", ext: "webp", width: out.info.width, height: out.info.height };
  }
  const out = await base.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { ok: true, body: out.data, contentType: "image/jpeg", ext: "jpg", width: out.info.width, height: out.info.height };
}

/** Keeps a cleaned upload for one product and returns it as a template photo choice. */
export async function saveTemplateUpload(productLegacyId: string, kind: TemplateUploadKind, body: Buffer): Promise<{ ok: true; media: TemplateMedia } | { ok: false; reason: TemplateUploadRefusal }> {
  const maxPx = (await getSettings(["shop.template_upload_max_px"] as const))["shop.template_upload_max_px"];
  const r = await processTemplateUpload(body, kind, { maxPx });
  if (!r.ok) return r;
  const name = `${randomBytes(8).toString("hex")}-${r.width}x${r.height}.${r.ext}`;
  await putObject("theme-assets", `${TEMPLATE_FOLDER}/${productLegacyId}/${name}`, r.body, r.contentType);
  return { ok: true, media: { id: `upload:${productLegacyId}/${name}`, url: `${publicBase()}${productLegacyId}/${name}`, alt: kind === "overlay" ? "Uploaded overlay" : "Uploaded photo", width: r.width, height: r.height } };
}
