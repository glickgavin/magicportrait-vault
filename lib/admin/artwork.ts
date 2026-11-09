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

/**
 * Before the checks: fixes what's easy to fix instead of refusing it. A picture with the right shape
 * but another size is resized to the card size (transparency kept); an overlay over 2 MB is
 * re-compressed losslessly, then, if still large, as a high-quality palette PNG. Returns notes on
 * what changed. A background with transparent areas is refused: it's almost always an overlay put in
 * the wrong slot, and its see-through parts would print as blank.
 */
export async function prepareArtwork(buf: Buffer, kind: "background" | "overlay", size = { w: 1500, h: 2100 }): Promise<{ buf: Buffer; notes: string[]; error?: string }> {
  const notes: string[] = [];
  let meta: Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return { buf, notes };
  }
  if (kind === "background" && meta.hasAlpha) {
    const alpha = (await sharp(buf).stats()).channels[3];
    if (alpha && alpha.min < 255) {
      return { buf, notes, error: "This picture has see-through areas, so it looks like an overlay. Upload it as the Overlay (it goes on top of everything), or flatten it first." };
    }
  }
  if (meta.width && meta.height && (meta.width !== size.w || meta.height !== size.h)) {
    const sameShape = Math.abs(meta.width / meta.height - size.w / size.h) <= 0.01;
    if (sameShape) {
      const img = sharp(buf).resize(size.w, size.h, { fit: "fill" });
      buf = meta.format === "png" ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      notes.push(`resized from ${meta.width} × ${meta.height}`);
    }
  }
  if (kind === "overlay" && meta.format === "png" && buf.length >= 2 * 1024 * 1024) {
    const lossless = await sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
    buf = lossless.length < buf.length ? lossless : buf;
    if (buf.length >= 2 * 1024 * 1024) {
      buf = await sharp(buf).png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 }).toBuffer();
      notes.push("compressed to a palette PNG");
    } else notes.push("compressed");
  }
  return { buf, notes };
}
