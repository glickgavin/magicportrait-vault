import sharp, { type Metadata } from "sharp";

/**
 * Checks and cleans a new upload (docs/shop.md › Images): by content, not file name; turned upright;
 * converted to JPEG with location and camera data removed; refused below the smallest short side.
 */
export type UploadRules = { maxBytes: number; minShortSidePx: number; jpegQuality: number };
export type UploadRefusal = "empty" | "too_large" | "not_an_image" | "unsupported" | "too_small";
export type UploadResult = { ok: true; jpeg: Buffer; width: number; height: number } | { ok: false; reason: UploadRefusal; width?: number; height?: number };

const ACCEPTED = new Set(["jpeg", "png", "webp", "heif"]);
// Guards against decompression bombs: about 100 megapixels.
const MAX_PIXELS = 100_000_000;

export async function processUpload(input: Buffer, rules: UploadRules): Promise<UploadResult> {
  if (!input.length) return { ok: false, reason: "empty" };
  if (input.length > rules.maxBytes) return { ok: false, reason: "too_large" };
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) return { ok: false, reason: meta.format ? "unsupported" : "not_an_image" };
  if ((meta.pages ?? 1) > 1 && meta.format !== "heif") return { ok: false, reason: "unsupported" };
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate() // applies the EXIF orientation, then the metadata is dropped (sharp keeps none by default)
      .flatten({ background: "#ffffff" }) // transparent PNGs print on white
      .jpeg({ quality: rules.jpegQuality, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer({ resolveWithObject: true });
    if (Math.min(info.width, info.height) < rules.minShortSidePx) return { ok: false, reason: "too_small", width: info.width, height: info.height };
    return { ok: true, jpeg: data, width: info.width, height: info.height };
  } catch {
    // e.g. HEIC from an iPhone where this build of libvips has no HEVC decoder.
    return { ok: false, reason: meta.format === "heif" ? "unsupported" : "not_an_image" };
  }
}

/** Width and height from the first bytes of a picture, without decoding it. */
export async function measureImage(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!m.width || !m.height) return null;
    // EXIF orientations 5–8 swap width and height once the picture is turned upright.
    return (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
  } catch {
    return null;
  }
}
