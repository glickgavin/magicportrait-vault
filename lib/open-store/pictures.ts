import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { hashKey } from "@/lib/auth/http";
import { startOfDayIn, dayIn } from "@/lib/biztime";
import { countGenerations, generationById, insertGeneration, insertStorePhoto, storePhotoById, updateGeneration, type StoreGenerationImage, type StoreGenerationRow, type StorePhotoRow, type StoreVisitorRow } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import { getProductSetting } from "@/lib/settings/product";
import { processUpload, type UploadRefusal } from "@/lib/shop/upload";
import { getImagenApi, type ImagenStatus } from "@/lib/sources/imagen-api";
import { putObject } from "@/lib/storage";
import { track, type TrackOptions } from "@/lib/track";
import { getStoreCatalog, imagenThemes } from "./index";

/**
 * Making a picture (docs/open-store.md › Creating the picture): photos checked and kept, the limits, Imagen's
 * session, its status, and our own copy of the results. Ownership is checked by the callers (routes).
 */

export type StartRefusal =
  | { error: "not_in_store" }
  | { error: "photos_missing" }
  | { error: "photo_refused"; slot: number; reason: UploadRefusal }
  | { error: "names_too_long" }
  | { error: "limit_visitor"; count: number }
  | { error: "limit_ip" }
  | { error: "busy" }
  | { error: "imagen_unavailable" };

/** A photo for one slot: a new file, or one the visitor added before. */
export type PhotoInput = { file: Buffer } | { photoId: string };

const TERMINAL = new Set(["done", "failed", "timed_out"]);

/** Server events about a visitor: no email until they're linked (identity is completed in Open store 5). */
const asVisitor = (visitorId: string): TrackOptions => ({ distinctId: `store:${visitorId}`, source: "vault", actor: "customer" });
const seconds = (gen: StoreGenerationRow, now: number) => Math.round((now - new Date(gen.created_at).getTime()) / 1000);

async function dayStart(): Promise<Date> {
  const tz = (await getSettings(["brand.timezone"] as const))["brand.timezone"];
  return startOfDayIn(tz, dayIn(tz, new Date()));
}

/** Saves a checked photo as JPEG without location or camera data, under the visitor's folder. */
export async function saveStorePhoto(visitorId: string, input: Buffer): Promise<{ ok: true; photo: StorePhotoRow } | { ok: false; reason: UploadRefusal }> {
  const s = await getSettings(["shop.upload_max_mb", "shop.upload_jpeg_quality", "open_store.min_photo_px", "open_store.upload_max_px"] as const);
  const r = await processUpload(input, { maxBytes: s["shop.upload_max_mb"] * 1024 * 1024, minShortSidePx: s["open_store.min_photo_px"], jpegQuality: s["shop.upload_jpeg_quality"] });
  if (!r.ok) {
    await track("store_photo_uploaded", { ok: false, reason: r.reason, width: r.width ?? null, height: r.height ?? null, store_visitor_id: visitorId }, asVisitor(visitorId));
    return { ok: false, reason: r.reason };
  }
  // The browser shrinks big photos first; the server keeps the same cap for anything that skipped that.
  let { jpeg, width, height } = r;
  const max = s["open_store.upload_max_px"];
  if (Math.max(width, height) > max) {
    const out = await sharp(jpeg).resize(max, max, { fit: "inside" }).jpeg({ quality: s["shop.upload_jpeg_quality"], mozjpeg: true }).toBuffer({ resolveWithObject: true });
    [jpeg, width, height] = [out.data, out.info.width, out.info.height];
  }
  const id = randomUUID();
  const storagePath = `${visitorId}/photos/${id}.jpg`;
  await putObject("store-uploads", storagePath, jpeg, "image/jpeg");
  const photo = await insertStorePhoto({ id, visitorId, storagePath, width, height });
  await track("store_photo_uploaded", { ok: true, reason: null, width, height, store_visitor_id: visitorId }, asVisitor(visitorId));
  return { ok: true, photo };
}

/** Starts a picture for this visitor on one product. Checks the product, the limits, then each photo, then asks Imagen. */
export async function startGeneration(input: { visitor: StoreVisitorRow; productLegacyId: string; photos: PhotoInput[]; names: string[]; ip: string }): Promise<{ ok: true; generation: StoreGenerationRow } | StartRefusal> {
  const catalog = await getStoreCatalog();
  const entry = catalog.entries.find((e) => e.product.legacyId === input.productLegacyId);
  if (!entry || entry.hidden.length || !entry.theme) return { error: "not_in_store" };
  const themes = await imagenThemes();
  const theme = themes?.find((t) => t.slug === entry.theme) ?? null;
  const [wording, nameMax] = await Promise.all([getProductSetting(entry.product, "photos"), getProductSetting(entry.product, "name_max")]);
  const slots = Math.max(1, theme?.photos ?? wording.length);
  if (input.photos.length < slots) return { error: "photos_missing" };
  const names = input.names.slice(0, slots).map((n) => n.trim());
  if (names.some((n) => n.length > nameMax)) return { error: "names_too_long" };

  const s = await getSettings(["open_store.generations_per_visitor_per_day", "open_store.generations_per_ip_per_day", "open_store.generations_daily_cap"] as const);
  const since = await dayStart();
  const ipHash = hashKey(input.ip);
  const [mine, fromIp, all] = await Promise.all([countGenerations({ since, visitorId: input.visitor.id }), countGenerations({ since, ipHash }), countGenerations({ since })]);
  const refused = async (reason: string) => track("store_generation_failed", { product_id: entry.product.legacyId, theme_slug: entry.theme, reason, seconds: 0, store_visitor_id: input.visitor.id }, asVisitor(input.visitor.id));
  if (mine >= s["open_store.generations_per_visitor_per_day"]) {
    await refused("limit_visitor");
    return { error: "limit_visitor", count: mine };
  }
  if (fromIp >= s["open_store.generations_per_ip_per_day"]) {
    await refused("limit_ip");
    return { error: "limit_ip" };
  }
  if (all >= s["open_store.generations_daily_cap"]) {
    await refused("daily_cap");
    return { error: "busy" };
  }

  const rows: StorePhotoRow[] = [];
  for (const [i, p] of input.photos.slice(0, slots).entries()) {
    if ("photoId" in p) {
      const row = await storePhotoById(p.photoId);
      if (!row || row.visitor_id !== input.visitor.id) return { error: "photo_refused", slot: i, reason: "not_an_image" };
      rows.push(row);
    } else {
      const saved = await saveStorePhoto(input.visitor.id, p.file);
      if (!saved.ok) {
        await refused("bad_photo");
        return { error: "photo_refused", slot: i, reason: saved.reason };
      }
      rows.push(saved.photo);
    }
  }
  const api = getImagenApi();
  const { getObject } = await import("@/lib/storage");
  const buffers = await Promise.all(rows.map((r) => getObject("store-uploads", r.storage_path)));
  if (buffers.some((b) => !b)) return { error: "imagen_unavailable" };
  let session: { sessionId: string; status: ImagenStatus };
  try {
    session = await api.generate({ theme: entry.theme, names, photos: buffers as Buffer[], clientUserId: `open-store:${input.visitor.id}` });
  } catch (e) {
    console.error(`[open-store] imagen generate failed: ${(e as Error).message}`);
    return { error: "imagen_unavailable" };
  }
  const generation = await insertGeneration({
    visitorId: input.visitor.id,
    productId: entry.product.id,
    theme: entry.theme,
    photoIds: rows.map((r) => r.id),
    names,
    ipHash,
    sessionId: session.sessionId,
    status: ourStatus(session.status) ?? "pending",
  });
  await track(
    "store_generation_started",
    { product_id: entry.product.legacyId, theme_slug: entry.theme, session_id: session.sessionId, photos: rows.length, has_name: names.some(Boolean), attempt: mine + 1, store_visitor_id: input.visitor.id },
    asVisitor(input.visitor.id),
  );
  return { ok: true, generation };
}

/** Imagen's status → ours; `cancelled` and `awaiting_face_selection` fail (open-store themes mustn't ask for faces). */
export function ourStatus(s: ImagenStatus): StoreGenerationRow["status"] | null {
  if (s === "pending" || s === "preprocessing" || s === "generating" || s === "done") return s;
  return "failed";
}

/** Asks Imagen how a picture is going (unless it's finished), times it out, and keeps our copy once it's done. */
export async function refreshGeneration(gen: StoreGenerationRow, now = Date.now()): Promise<StoreGenerationRow> {
  if (TERMINAL.has(gen.status) || !gen.imagen_session_id) return gen;
  const next = await askImagen(gen, now);
  if (next.status !== gen.status && TERMINAL.has(next.status)) {
    const product = await productLegacyId(gen.product_id);
    if (next.status === "done") {
      await track("store_generation_ready", { product_id: product, theme_slug: gen.theme, session_id: gen.imagen_session_id, seconds: seconds(gen, now), images: next.images.length, cost_usd: next.cost_usd, store_visitor_id: gen.visitor_id }, asVisitor(gen.visitor_id));
    } else {
      await track("store_generation_failed", { product_id: product, theme_slug: gen.theme, reason: next.status === "timed_out" ? "timeout" : "imagen_failed", seconds: seconds(gen, now), store_visitor_id: gen.visitor_id }, asVisitor(gen.visitor_id));
    }
  }
  return next;
}

/** Shopify's numeric id from the gid kept on the row (what analytics uses everywhere). */
const productLegacyId = async (gid: string) => gid.split("/").pop() ?? gid;

async function askImagen(gen: StoreGenerationRow, now: number): Promise<StoreGenerationRow> {
  const s = await getSettings(["open_store.timeout_s"] as const);
  const age = (now - new Date(gen.created_at).getTime()) / 1000;
  const api = getImagenApi();
  let session;
  try {
    session = await api.session(gen.imagen_session_id!);
  } catch (e) {
    console.error(`[open-store] imagen status failed: ${(e as Error).message}`);
    if (age > s["open_store.timeout_s"]) return updateGeneration(gen.id, { status: "timed_out", finished_at: new Date(now).toISOString() });
    return gen;
  }
  const status = ourStatus(session.status);
  if (status === "done" && session.images.length) {
    const images: StoreGenerationImage[] = [];
    for (const [n, img] of session.images.entries()) {
      try {
        const raw = await api.download(img.url);
        const png = await sharp(raw, { limitInputPixels: 100_000_000 }).rotate().png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });
        const storagePath = `${gen.visitor_id}/pictures/${gen.id}/${n}.png`;
        await putObject("store-uploads", storagePath, png.data, "image/png");
        images.push({ imagen_id: img.id, url: img.url, width: png.info.width, height: png.info.height, storage_path: storagePath });
      } catch (e) {
        console.error(`[open-store] keeping picture ${n} failed: ${(e as Error).message}`);
      }
    }
    if (!images.length) return updateGeneration(gen.id, { status: "failed", finished_at: new Date(now).toISOString() });
    return updateGeneration(gen.id, { status: "done", images, cost_usd: session.costUsd, finished_at: new Date(now).toISOString() });
  }
  if (status === "failed") return updateGeneration(gen.id, { status: "failed", cost_usd: session.costUsd, finished_at: new Date(now).toISOString() });
  if (age > s["open_store.timeout_s"]) return updateGeneration(gen.id, { status: "timed_out", finished_at: new Date(now).toISOString() });
  if (status && status !== gen.status) return updateGeneration(gen.id, { status });
  return gen;
}

export async function generationFor(id: string): Promise<StoreGenerationRow | null> {
  return /^[0-9a-f-]{36}$/.test(id) ? generationById(id) : null;
}

/** File ids handed to the page: `p_<photo id>` for a photo, `g_<generation id>_<n>` for a picture. */
export const photoFileId = (photoId: string) => `p_${photoId}`;
export const pictureFileId = (generationId: string, n: number) => `g_${generationId}_${n}`;
export function parseFileId(id: string): { kind: "photo"; photoId: string } | { kind: "picture"; generationId: string; n: number } | null {
  let m = /^p_([0-9a-f-]{36})$/.exec(id);
  if (m) return { kind: "photo", photoId: m[1] };
  m = /^g_([0-9a-f-]{36})_(\d{1,2})$/.exec(id);
  if (m) return { kind: "picture", generationId: m[1], n: Number(m[2]) };
  return null;
}

/** What the page sees of a picture: status, the step, whether it's slow, and our copies (never Imagen's URL). */
export type GenerationView = {
  id: string;
  productId: string;
  status: StoreGenerationRow["status"];
  /** 0 uploading, 1 painting, 2 putting it on the product. */
  step: 0 | 1 | 2;
  slow: boolean;
  images: { file: string; width: number; height: number }[];
  chosen: number;
  photos: string[];
};

export async function generationView(gen: StoreGenerationRow, now = Date.now()): Promise<GenerationView> {
  const s = await getSettings(["open_store.slow_after_s"] as const);
  const age = (now - new Date(gen.created_at).getTime()) / 1000;
  const images = gen.images.flatMap((img, n) => (img.storage_path ? [{ file: pictureFileId(gen.id, n), width: img.width, height: img.height }] : []));
  return {
    id: gen.id,
    productId: gen.product_id,
    status: gen.status,
    step: gen.status === "done" ? 2 : 1,
    slow: !TERMINAL.has(gen.status) && age > s["open_store.slow_after_s"],
    images,
    chosen: Math.min(gen.chosen_index, Math.max(0, images.length - 1)),
    photos: gen.photo_ids.map(photoFileId),
  };
}
