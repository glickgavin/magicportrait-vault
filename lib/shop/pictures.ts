import "server-only";
import { cache } from "react";
import { mapLimit, timed } from "@/lib/perf";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { insertNewUpload, knownSizes, newUploadById, newUploadsFor, rememberExternalImage } from "@/lib/db/shop";
import { getSettings } from "@/lib/settings";
import { putObject, signedUrl } from "@/lib/storage";
import { track } from "@/lib/track";
import { maskEmail } from "@/lib/utils";
import { getVaultProfile } from "@/lib/vault/profile";
import { buildImageList, isAllowedUrl, looksLikeImageId, orderedPhotoTiles, type RawPhotoTile, type ShopImage } from "./images";
import { getShopImagesSource } from "./sources";
import type { MirrorImageProps, ShopImagesSource } from "./sources/images";
import type { UploadRefusal } from "./upload";

/** The signed-in person's pictures for the shop: portraits, past photos, photo tiles and new uploads. */
export type PictureList = { portraits: ShopImage[]; photos: ShopImage[]; partial: boolean };

const tileUrlCache = new Map<string, string | null>();
const TILE_CACHE_MAX = 5000;

/** A mirror tile id → its file in the main site's photo-tile folder (the extension is checked once). */
async function photoTileUrl(tileId: string, base: string, exts: string[], timeoutMs: number): Promise<string | null> {
  if (tileUrlCache.has(tileId)) return tileUrlCache.get(tileId) ?? null;
  if (env.dataSource === "fixtures") return `${base}${tileId}.${exts[0] ?? "jpg"}`;
  if (tileUrlCache.size >= TILE_CACHE_MAX) tileUrlCache.clear();
  for (const ext of exts) {
    const url = `${base}${tileId}.${ext}`;
    try {
      const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (r.ok) {
        tileUrlCache.set(tileId, url);
        return url;
      }
    } catch {
      /* try the next one */
    }
  }
  tileUrlCache.set(tileId, null);
  return null;
}

type MirrorPictures = readonly [Awaited<ReturnType<ShopImagesSource["pastUploads"]>>, Awaited<ReturnType<ShopImagesSource["photoTileUploads"]>>];
/** The mirror's past photos and photo tiles per person, kept briefly like the profile (memory only). */
const mirrorMemory = new Map<string, { at: number; value: MirrorPictures }>();

async function mirrorPictures(email: string, props: MirrorImageProps, keepMs: number): Promise<MirrorPictures> {
  const kept = mirrorMemory.get(email);
  if (keepMs > 0 && kept && Date.now() - kept.at < keepMs) return kept.value;
  const src = await getShopImagesSource();
  const emails = [email];
  const value = await timed("mirror.shopPictures", () => Promise.all([src.pastUploads(emails, props), src.photoTileUploads(emails, props)]));
  if (keepMs > 0) {
    if (mirrorMemory.size >= 500) mirrorMemory.delete(mirrorMemory.keys().next().value!);
    mirrorMemory.set(email, { at: Date.now(), value });
  }
  return value;
}

/** Everything one person can pick from. Memoised per request; the outside reads run side by side. */
export const listPictures = cache(async (email: string): Promise<PictureList> => {
  const s = await getSettings([
    "redeem.allowed_image_hosts",
    "shop.photo_tile_base_url",
    "shop.photo_tile_extensions",
    "shop.mirror_upload_event",
    "shop.mirror_upload_property",
    "shop.mirror_tile_event",
    "shop.mirror_images_limit",
    "shop.image_fetch_timeout_ms",
    "vault.profile_memory_seconds",
  ] as const);
  const hosts = s["redeem.allowed_image_hosts"];
  const e = email.trim().toLowerCase();
  let partial = false;
  const props = { uploadEvent: s["shop.mirror_upload_event"], uploadProperty: s["shop.mirror_upload_property"], tileEvent: s["shop.mirror_tile_event"], limit: s["shop.mirror_images_limit"] };
  const [profile, [past, tiles], rows] = await Promise.all([
    getVaultProfile(email),
    mirrorPictures(e, props, s["vault.profile_memory_seconds"] * 1000).catch((err: unknown) => {
      partial = true;
      console.error(`[shop] mirror pictures unavailable (${maskEmail(email)}): ${(err as Error).message}`);
      return [[], []] as const;
    }),
    newUploadsFor(email),
  ]);
  if (profile.unavailable.length) partial = true;
  const portraits = profile.sessions.flatMap((g) => g.portraits.map((p) => ({ imageId: p.imageId, sessionId: p.sessionId, imageUrl: p.imageUrl, width: p.width, height: p.height, createdAt: p.createdAt, ordered: p.ordered })));
  const orderedTiles = orderedPhotoTiles(profile.rawOrders, hosts);

  // Each dropped tile's file is looked up once per server, several at a time.
  const orderedIds = new Set(orderedTiles.map((t) => t.tileId).filter(Boolean));
  const dropped = await mapLimit(
    tiles.filter((t) => !orderedIds.has(t.tileId)),
    8,
    async (t): Promise<RawPhotoTile | null> => {
      const url = await photoTileUrl(t.tileId, s["shop.photo_tile_base_url"], s["shop.photo_tile_extensions"], s["shop.image_fetch_timeout_ms"]);
      return url ? { url, tileId: t.tileId, createdAt: t.createdAt, ordered: false } : null;
    },
  );
  const droppedTiles = dropped.filter((t): t is RawPhotoTile => t !== null);
  const list = buildImageList({
    portraits,
    pastUploads: past.filter((u) => isAllowedUrl(u.url, hosts)),
    photoTiles: [...orderedTiles, ...droppedTiles],
    newUploads: rows.map((r) => ({ id: r.id, storagePath: r.storage_path!, width: r.width!, height: r.height!, createdAt: r.created_at })),
  });
  // Fill in sizes we measured before.
  const urls = [...list.portraits, ...list.photos].flatMap((i) => ("url" in i.source && (!i.width || !i.height) ? [i.source.url] : []));
  const sizes = await knownSizes(email, urls);
  for (const i of [...list.portraits, ...list.photos]) {
    if ("url" in i.source && (!i.width || !i.height)) {
      const k = sizes.get(i.source.url);
      if (k) [i.width, i.height] = [k.width, k.height];
    }
  }
  return { ...list, partial };
});

/** One of the signed-in person's own pictures, or null. Never looks anywhere but their own list. */
export async function pictureFor(email: string, id: string): Promise<ShopImage | null> {
  if (!looksLikeImageId(id)) return null;
  if (id.startsWith("n_")) {
    const r = await newUploadById(email, id.slice(2));
    return r ? { id, kind: "new_upload", source: { storagePath: r.storage_path! }, width: r.width, height: r.height, createdAt: r.created_at, ordered: false, ref: null, sessionId: null } : null;
  }
  const list = await listPictures(email);
  return [...list.portraits, ...list.photos].find((i) => i.id === id) ?? null;
}

/** Reads a public picture's size once (allowed hosts only, size-capped, timed out) and keeps it. */
export async function ensureSize(email: string, img: ShopImage): Promise<ShopImage> {
  if (img.width && img.height) return img;
  if (!("url" in img.source) || img.kind === "new_upload") return img;
  const s = await getSettings(["redeem.allowed_image_hosts", "shop.image_fetch_timeout_ms", "shop.image_fetch_max_mb"] as const);
  if (!isAllowedUrl(img.source.url, s["redeem.allowed_image_hosts"])) return img;
  let size: { width: number; height: number } | null = null;
  if (env.dataSource === "fixtures") size = { width: 2048, height: 2048 };
  else {
    try {
      const r = await fetch(img.source.url, { signal: AbortSignal.timeout(s["shop.image_fetch_timeout_ms"]), cache: "no-store" });
      const len = Number(r.headers.get("content-length") ?? 0);
      if (r.ok && (!len || len <= s["shop.image_fetch_max_mb"] * 1024 * 1024)) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length <= s["shop.image_fetch_max_mb"] * 1024 * 1024) size = await (await import("./upload")).measureImage(buf);
      }
    } catch {
      size = null;
    }
  }
  if (!size) return img;
  await rememberExternalImage(email, { kind: img.kind, url: img.source.url, ref: img.ref, session: img.sessionId, width: size.width, height: size.height });
  return { ...img, ...size };
}

/** A link the browser can show: public pictures as they are, new uploads as a short-lived signed link. */
export async function pictureLink(img: ShopImage): Promise<string | null> {
  if ("url" in img.source) return img.source.url;
  const secs = (await getSettings(["shop.image_link_seconds"] as const))["shop.image_link_seconds"];
  return signedUrl("shop-uploads", img.source.storagePath, secs);
}

export type SaveUploadResult = { ok: true; image: ShopImage } | { ok: false; reason: UploadRefusal };

/** Checks, cleans and keeps a new upload in the private shop-uploads bucket. */
export async function saveUpload(email: string, body: Buffer): Promise<SaveUploadResult> {
  const s = await getSettings(["shop.upload_max_mb", "shop.upload_min_short_side_px", "shop.upload_jpeg_quality"] as const);
  const { processUpload } = await import("./upload");
  const r = await processUpload(body, { maxBytes: s["shop.upload_max_mb"] * 1024 * 1024, minShortSidePx: s["shop.upload_min_short_side_px"], jpegQuality: s["shop.upload_jpeg_quality"] });
  if (!r.ok) {
    await track("shop_image_uploaded", { ok: false, reason: r.reason }, { email });
    return { ok: false, reason: r.reason };
  }
  const id = randomUUID();
  const storagePath = `u/${id}.jpg`;
  await putObject("shop-uploads", storagePath, r.jpeg, "image/jpeg");
  const row = await insertNewUpload(email, { id, storagePath, width: r.width, height: r.height });
  await track("shop_image_uploaded", { ok: true, width: r.width, height: r.height }, { email });
  return { ok: true, image: { id: `n_${row.id}`, kind: "new_upload", source: { storagePath }, width: r.width, height: r.height, createdAt: row.created_at, ordered: false, ref: null, sessionId: null } };
}

/** The full picture, for drawing the order line's preview on the server (allowed hosts, capped). */
export async function pictureBytes(img: Pick<ShopImage, "source">): Promise<Buffer | null> {
  if ("storagePath" in img.source) {
    const { getObject } = await import("@/lib/storage");
    return getObject("shop-uploads", img.source.storagePath);
  }
  const s = await getSettings(["redeem.allowed_image_hosts", "shop.image_fetch_timeout_ms", "shop.image_fetch_max_mb"] as const);
  if (!isAllowedUrl(img.source.url, s["redeem.allowed_image_hosts"])) return null;
  if (env.dataSource === "fixtures") {
    // Fixture pictures aren't fetched: a made-up 2048 × 2048 picture stands in.
    const sharp = (await import("sharp")).default;
    return sharp({ create: { width: 2048, height: 2048, channels: 3, background: "#9bb7a0" } }).jpeg().toBuffer();
  }
  try {
    const r = await fetch(img.source.url, { signal: AbortSignal.timeout(s["shop.image_fetch_timeout_ms"] * 2), cache: "no-store" });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= s["shop.image_fetch_max_mb"] * 1024 * 1024 ? b : null;
  } catch {
    return null;
  }
}
