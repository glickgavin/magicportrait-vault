import { createHash } from "node:crypto";

/**
 * The pictures a customer can use in the shop (docs/shop.md › Images). Pure: the server gathers the
 * raw lists, this merges them. Ids are opaque (a hash of the kind and URL, or our row id for new
 * uploads) and are only ever resolved against the signed-in person's own list.
 */
export type ShopImageKind = "portrait" | "upload" | "photo_tile" | "new_upload";

export type ShopImage = {
  id: string;
  kind: ShopImageKind;
  /** Full-size source: a public link (Imagen, photo tiles) or, for new uploads, a storage path. */
  source: { url: string } | { storagePath: string };
  width: number | null;
  height: number | null;
  createdAt: string;
  /** Shown as a small label: the picture was on a paid order. */
  ordered: boolean;
  /** Imagen image id (portraits) or tile id (photo tiles), for the order line. */
  ref: string | null;
  sessionId: string | null;
};

export type RawPortrait = { imageId: string; sessionId: string; imageUrl: string; width: number | null; height: number | null; createdAt: string; ordered: boolean };
export type RawPastUpload = { url: string; createdAt: string };
export type RawPhotoTile = { url: string; tileId: string | null; createdAt: string; ordered: boolean };
export type RawNewUpload = { id: string; storagePath: string; width: number; height: number; createdAt: string };

export function externalImageId(kind: ShopImageKind, url: string): string {
  return `${kind === "portrait" ? "p" : kind === "upload" ? "u" : "t"}_${createHash("sha256").update(`${kind}|${url}`).digest("base64url").slice(0, 22)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function newUploadImageId(rowId: string): string {
  return `n_${rowId}`;
}
export function looksLikeImageId(id: string): boolean {
  return /^[put]_[A-Za-z0-9_-]{22}$/.test(id) || (id.startsWith("n_") && UUID.test(id.slice(2)));
}

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

/**
 * Portraits (as My portraits lists them) and My photos (past uploads, photo tiles and new uploads
 * together, newest first). The same URL shows once; an ordered photo tile wins over the same file
 * found only in the mirror, so the "ordered" label survives the de-duplication.
 */
export function buildImageList(input: { portraits: RawPortrait[]; pastUploads: RawPastUpload[]; photoTiles: RawPhotoTile[]; newUploads: RawNewUpload[] }): { portraits: ShopImage[]; photos: ShopImage[] } {
  const seen = new Set<string>();
  const portraits: ShopImage[] = [];
  for (const p of [...input.portraits].sort(byNewest)) {
    if (!p.imageUrl || seen.has(p.imageUrl)) continue;
    seen.add(p.imageUrl);
    portraits.push({ id: externalImageId("portrait", p.imageUrl), kind: "portrait", source: { url: p.imageUrl }, width: p.width, height: p.height, createdAt: p.createdAt, ordered: p.ordered, ref: p.imageId, sessionId: p.sessionId });
  }

  const photos: ShopImage[] = [];
  const tiles = [...input.photoTiles].sort((a, b) => Number(b.ordered) - Number(a.ordered) || byNewest(a, b));
  for (const t of tiles) {
    if (!t.url || seen.has(t.url)) continue;
    seen.add(t.url);
    photos.push({ id: externalImageId("photo_tile", t.url), kind: "photo_tile", source: { url: t.url }, width: null, height: null, createdAt: t.createdAt, ordered: t.ordered, ref: t.tileId, sessionId: null });
  }
  for (const u of input.pastUploads) {
    if (!u.url || seen.has(u.url)) continue;
    seen.add(u.url);
    photos.push({ id: externalImageId("upload", u.url), kind: "upload", source: { url: u.url }, width: null, height: null, createdAt: u.createdAt, ordered: false, ref: null, sessionId: null });
  }
  for (const n of input.newUploads) {
    photos.push({ id: newUploadImageId(n.id), kind: "new_upload", source: { storagePath: n.storagePath }, width: n.width, height: n.height, createdAt: n.createdAt, ordered: false, ref: null, sessionId: null });
  }
  photos.sort(byNewest);
  return { portraits, photos };
}

/** Photo tiles on the person's own paid orders: lines with `_tile_type` = photo and an `_image_url`. */
export function orderedPhotoTiles(orders: { createdAt: string; cancelledAt: string | null; lineItems: { customAttributes: { key: string; value: string }[] }[] }[], allowedHosts: string[]): RawPhotoTile[] {
  const out: RawPhotoTile[] = [];
  for (const o of orders) {
    if (o.cancelledAt) continue;
    for (const l of o.lineItems) {
      const a = Object.fromEntries(l.customAttributes.map((x) => [x.key, x.value]));
      if (a._tile_type !== "photo" || !a._image_url) continue;
      if (!isAllowedUrl(a._image_url, allowedHosts)) continue;
      out.push({ url: a._image_url, tileId: a._tile_id ?? null, createdAt: o.createdAt, ordered: true });
    }
  }
  return out;
}

/** Only https links on the allowed image hosts are ever fetched or shown (redeem.allowed_image_hosts). */
export function isAllowedUrl(u: string, allowedHosts: string[]): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && allowedHosts.includes(url.hostname) && !url.search.includes("token=");
  } catch {
    return false;
  }
}
