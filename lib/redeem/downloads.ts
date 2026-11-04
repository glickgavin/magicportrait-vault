import "server-only";
import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { findOwnedOrder } from "./access";
import { redeemConfig, viewOrder } from "./service";
import { extFromContentType, fileName, zipName } from "./lock";
import { fetchAllowedImage } from "@/lib/images";
import { hashKey, rateLimit } from "@/lib/auth/http";
import { track } from "@/lib/track";

const err = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

async function prepare(email: string, orderParam: string) {
  const cfg = await redeemConfig();
  if (!(await rateLimit(`download:${hashKey(email)}`, cfg.s["redeem.download_rate_limit_per_hour"]))) return { res: err(429, "rate_limited") } as const;
  const order = await findOwnedOrder(email, orderParam);
  if (!order) return { res: err(404, "not_found") } as const;
  const view = await viewOrder(order);
  if (!view.downloadsEnabled) return { res: err(409, "not_eligible") } as const;
  return { cfg, view } as const;
}

/** One portrait (n = 1-based position among the order's portraits, as on live). */
export async function downloadOne(email: string, orderParam: string, n: number): Promise<Response> {
  const p = await prepare(email, orderParam);
  if ("res" in p) return p.res!;
  const { cfg, view } = p;
  const portrait = view.parsed.portraits[n - 1];
  if (!portrait) return err(404, "not_found");
  const orderId = view.order.legacyId;
  try {
    const { body, contentType } = await fetchAllowedImage(portrait.imageUrl, cfg.s["redeem.allowed_image_hosts"]);
    const name = fileName(cfg.s["redeem.file_name_template"], portrait.theme, cfg.s["redeem.file_default_theme"], n, extFromContentType(contentType));
    await track("redeem_download_completed", { order_id: orderId, tile_id: portrait.tileId, filename: name, bytes: body.length }, { email, ref: { type: "order", id: orderId } });
    return new Response(new Uint8Array(body), {
      headers: { "content-type": contentType, "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store", "content-length": String(body.length) },
    });
  } catch (e) {
    await track("redeem_download_failed", { order_id: orderId, tile_id: portrait.tileId, reason: (e as Error).message.slice(0, 60) }, { email, ref: { type: "order", id: orderId } });
    return err(502, "upstream_failed");
  }
}

/** Every portrait as a streamed .zip. Numbering matches the single downloads; missing files are listed in the zip. */
export async function downloadAll(email: string, orderParam: string): Promise<Response> {
  const p = await prepare(email, orderParam);
  if ("res" in p) return p.res!;
  const { cfg, view } = p;
  const orderId = view.order.legacyId;
  const name = zipName(cfg.s["redeem.zip_name_template"], view.order.name);
  const zip = archiver("zip", { zlib: { level: 1 } });
  const out = new PassThrough();
  zip.pipe(out);
  void (async () => {
    const missing: string[] = [];
    let bytes = 0;
    for (const [i, portrait] of view.parsed.portraits.entries()) {
      try {
        const { body, contentType } = await fetchAllowedImage(portrait.imageUrl, cfg.s["redeem.allowed_image_hosts"]);
        zip.append(body, { name: fileName(cfg.s["redeem.file_name_template"], portrait.theme, cfg.s["redeem.file_default_theme"], i + 1, extFromContentType(contentType)) });
        bytes += body.length;
      } catch {
        missing.push(`${i + 1}`);
      }
    }
    if (missing.length) zip.append(`These portraits couldn't be included: ${missing.join(", ")}.\nPlease download them one by one, or chat with us.\n`, { name: "missing-files.txt" });
    await zip.finalize();
    await track(missing.length === view.parsed.portraits.length ? "redeem_download_all_failed" : "redeem_download_all_completed", { order_id: orderId, portrait_count: view.parsed.portraits.length, filename: name, bytes, missing: missing.length }, { email, ref: { type: "order", id: orderId } });
  })().catch((e) => zip.abort?.() ?? console.error(`[redeem] zip failed: ${(e as Error).message}`));
  return new Response(Readable.toWeb(out) as unknown as ReadableStream, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
