import sharp, { type Metadata } from "sharp";

export type ArtworkCheck = { ok: true; width: number; height: number; format: string; bytes: number; hasAlpha: boolean } | { ok: false; errors: string[] };

/** Upload checks from the template editor: 1500 × 2100, sRGB, under 2 MB; overlays are PNGs with transparency. */
export async function checkArtwork(buf: Buffer, kind: "background" | "overlay", size = { w: 1500, h: 2100 }, maxBytes = 2 * 1024 * 1024): Promise<ArtworkCheck> {
  const errors: string[] = [];
  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return { ok: false, errors: ["Not an image we can read"] };
  }
  if (buf.length >= maxBytes) errors.push(`Must be under ${Math.round(maxBytes / 1024 / 1024)} MB (this is ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  if (meta.width !== size.w || meta.height !== size.h) errors.push(`Must be ${size.w} × ${size.h} px (this is ${meta.width} × ${meta.height})`);
  if (meta.space && meta.space !== "srgb" && meta.space !== "b-w") errors.push(`Must be sRGB (this is ${meta.space})`);
  if (meta.icc) {
    const icc = meta.icc.toString("latin1");
    if (!/sRGB|IEC61966/i.test(icc)) errors.push("Embedded colour profile isn't sRGB");
  }
  if (kind === "background" && !["jpeg", "png"].includes(meta.format ?? "")) errors.push("Background must be a JPEG or PNG");
  if (kind === "overlay") {
    if (meta.format !== "png") errors.push("Overlay must be a PNG");
    if (!meta.hasAlpha) errors.push("Overlay must have transparency");
    else {
      const stats = await sharp(buf).stats();
      const alpha = stats.channels[3];
      if (!alpha || alpha.min === 255) errors.push("Overlay has an alpha channel but no transparent pixels");
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, width: meta.width!, height: meta.height!, format: meta.format!, bytes: buf.length, hasAlpha: Boolean(meta.hasAlpha) };
}
