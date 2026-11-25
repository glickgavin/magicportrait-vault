import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { dueJobs, jobById, queuePrinterJob, recentJobs, updateJob, type JobLine, type PrinterJobRow } from "@/lib/db/printers";
import { lineForFulfilment } from "@/lib/db/shop";
import { generationBySession } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import { pictureBytes } from "@/lib/shop/pictures";
import { layerValuesFromProps } from "@/lib/shop/layer";
import { composePrintFile } from "@/lib/shop/print-file";
import { DreamshipError, getDreamship, LOCKED_STATUSES, orderUrl, type DreamshipOrder } from "@/lib/sources/dreamship";
import { getObject, putObject, signedUrl } from "@/lib/storage";
import { track } from "@/lib/track";

/**
 * The customer's picture on Dreamship's imported order (docs/dreamship.md › Part B, CLAUDE.md allowed write 7).
 * For each personalised Dreamship line of a paid Shopify order: make the print file (the chosen picture cropped by
 * `_shop_crop` and sized to `print_px`), upload it as artwork, and set it on that line of the order Dreamship's own
 * Shopify app imported. That's all. It never submits, cancels or changes an order's status: whether the order waits
 * or goes to print is set in Dreamship and Shopify. Lines without a picture keep Dreamship's own artwork.
 */

const prop = z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable().transform((v) => (v === null ? null : String(v))) });
const paidSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional().nullable(),
  test: z.boolean().optional().nullable(),
  line_items: z.array(z.object({ id: z.union([z.number(), z.string()]).transform(String), product_id: z.union([z.number(), z.string()]).nullable().optional(), sku: z.string().optional().nullable(), quantity: z.number().default(1), properties: z.array(prop).optional().nullable() }).passthrough()).default([]),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pxOf = (v: string | null | undefined) => {
  const m = /^(\d{2,6})x(\d{2,6})$/i.exec((v ?? "").trim());
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};
const cropOf = (v: string | null | undefined) => {
  const n = (v ?? "").split(",").map(Number);
  return n.length === 4 && n.every((x) => Number.isInteger(x) && x >= 0) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
};

/** The order's personalised Dreamship lines (`_shop` = true, `_shop_maker` = dreamship, with a picture we hold). */
export function dreamshipLines(payload: unknown): { orderId: string; name: string | null; lines: JobLine[] } | null {
  const p = paidSchema.safeParse(payload);
  if (!p.success) return null;
  const lines: JobLine[] = [];
  for (const li of p.data.line_items) {
    const at = (k: string) => li.properties?.find((x) => x.name === k)?.value ?? null;
    if (at("_shop") !== "true" || at("_shop_maker") !== "dreamship") continue;
    let extra: { print_area?: unknown; product_variant_id?: unknown } = {};
    try {
      extra = JSON.parse(at("_shop_extra") ?? "{}") as typeof extra;
    } catch {
      /* no extra: the line can't be placed */
    }
    const printArea = typeof extra.print_area === "string" ? extra.print_area : null;
    const printPx = pxOf(at("_shop_print_px"));
    const pv = Number(extra.product_variant_id ?? li.sku ?? NaN);
    const page = at("_shop_page");
    const picture: JobLine["picture"] | null =
      page === "open_store" && at("_shop_session_id") && at("_shop_image_id")
        ? { kind: "open_store", sessionId: at("_shop_session_id")!, imageId: at("_shop_image_id")! }
        : UUID.test(at("_vault_line_id") ?? "")
          ? { kind: "shop", vaultLineId: at("_vault_line_id")! }
          : null;
    // Without a picture or a print area there's nothing to put on it: Dreamship's own artwork stays.
    if (!printArea || !printPx || !picture) continue;
    const layerValues = layerValuesFromProps(Object.fromEntries((li.properties ?? []).map((x) => [x.name, x.value ?? ""])));
    lines.push({ lineId: li.id, quantity: li.quantity, productVariantId: Number.isFinite(pv) ? pv : null, printArea, printPx, crop: cropOf(at("_shop_crop")), picture, ...(layerValues && li.product_id ? { layerValues, productId: `gid://shopify/Product/${li.product_id}` } : {}) });
  }
  return { orderId: p.data.id, name: p.data.name ?? null, lines };
}

/** orders/paid: queues one job for the order when it has personalised Dreamship lines (the webhook then tries it after its reply). */
export async function queueFromPaidOrder(payload: unknown): Promise<{ queued: boolean; jobId?: string }> {
  const found = dreamshipLines(payload);
  if (!found || !found.lines.length) return { queued: false };
  // Personalised lines keep the product's layer as it is now, so the words land where the customer saw them.
  const { attachLayers } = await import("@/lib/shop/print-jobs");
  const job = await queuePrinterJob({ kind: "dreamship_artwork", shopifyOrderId: found.orderId, name: found.name, lines: await attachLayers(found.lines) });
  return { queued: true, jobId: job.id };
}

/** Our copy of the line's chosen picture. */
export async function pictureFor(line: JobLine): Promise<Buffer | null> {
  if (line.picture.kind === "open_store") {
    const gen = await generationBySession(line.picture.sessionId);
    const img = gen?.images.find((i) => i.imagen_id === (line.picture as { imageId: string }).imageId) ?? gen?.images[gen.chosen_index];
    return img?.storage_path ? getObject("store-uploads", img.storage_path) : null;
  }
  const found = await lineForFulfilment(line.picture.vaultLineId);
  if (!found) return null;
  return pictureBytes({ source: found.image.storage_path ? { storagePath: found.image.storage_path } : { url: found.image.source_url! } });
}

/** The print file: the picture cropped as the customer saw it and sized to the print area, as JPEG. */
export async function printFile(picture: Buffer, line: Pick<JobLine, "crop" | "printPx" | "layer" | "layerValues">): Promise<Buffer> {
  return composePrintFile(picture, { crop: line.crop, printPx: line.printPx, layer: line.layer && line.layerValues ? { layer: line.layer, values: line.layerValues } : null });
}

const backoffMs = (attempts: number) => Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
const MAX_ATTEMPTS = 12;

async function findOrder(job: PrinterJobRow): Promise<DreamshipOrder | null> {
  const ds = await getDreamship();
  // Dreamship's Shopify app keeps the Shopify order as the reference; which form it uses is still to confirm.
  return (await ds.orderByReference(job.shopify_order_id)) ?? (job.shopify_order_name ? await ds.orderByReference(job.shopify_order_name) : null);
}

async function record(job: PrinterJobRow, status: "picture_set" | "failed", reason: string | null) {
  const done = job.lines.filter((l) => l.done).length;
  await track("shop_order_sent_to_maker", { maker: "dreamship", status, lines: done, ...(reason ? { reason } : {}), dreamship_order_id: job.dreamship_order_id }, { source: "vault", actor: "system", ref: { type: "order", id: job.shopify_order_id } });
}

/**
 * One attempt at a job. Idempotent: a line already done (or whose Dreamship line already carries our artwork) is
 * skipped, so re-running it changes nothing.
 */
export async function runJob(jobId: string, now = new Date()): Promise<PrinterJobRow | null> {
  let job = await jobById(jobId);
  if (!job || job.status !== "waiting") return job;
  if (job.kind === "print_file") return (await import("@/lib/shop/print-jobs")).runPrintFileJob(job.id, now);
  const s = await getSettings(["dreamship.import_wait_hours"] as const);
  const attempts = job.attempts + 1;
  let order: DreamshipOrder | null;
  try {
    order = await findOrder(job);
  } catch (e) {
    return updateJob(job.id, { attempts, next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(), reason: `Couldn't read Dreamship: ${(e as Error).message.slice(0, 120)}` });
  }
  if (!order) {
    const waitedHours = (now.getTime() - new Date(job.created_at).getTime()) / 3_600_000;
    if (waitedHours >= s["dreamship.import_wait_hours"]) {
      job = await updateJob(job.id, { attempts, status: "needs_attention", reason: `Dreamship hasn't imported this order after ${s["dreamship.import_wait_hours"]} hours.` });
      await record(job, "failed", "not_imported");
      return job;
    }
    return updateJob(job.id, { attempts, next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(), reason: "Waiting for Dreamship to import the order." });
  }

  const lines = job.lines.map((l) => ({ ...l }));
  const pending = lines.filter((l) => !l.done);
  if (pending.length && LOCKED_STATUSES.has(order.status)) {
    job = await updateJob(job.id, { attempts, lines, status: "needs_attention", reason: "Dreamship had already sent it to print, so the picture couldn't be set.", dreamship_order_id: order.id, dreamship_status: order.status });
    await record(job, "failed", "already_submitted");
    return job;
  }
  const ds = await getDreamship();
  const usedDsLines = new Set(lines.filter((l) => l.dreamshipLineId).map((l) => l.dreamshipLineId!));
  let locked = false;
  for (const line of pending) {
    const dsLine = (line.dreamshipLineId ? order.lineItems.find((x) => x.id === line.dreamshipLineId) : null) ?? order.lineItems.find((x) => !usedDsLines.has(x.id) && x.productVariantId != null && x.productVariantId === line.productVariantId);
    if (!dsLine) {
      line.error = "No matching line on Dreamship's order.";
      continue;
    }
    usedDsLines.add(dsLine.id);
    line.dreamshipLineId = dsLine.id;
    // Already ours (an earlier run got this far): nothing to do.
    if (line.artworkId && dsLine.printAreas.some((p) => p.key === line.printArea && p.artworkId === line.artworkId)) {
      line.done = true;
      line.error = null;
      continue;
    }
    try {
      const pic = await pictureFor(line);
      if (!pic) {
        line.error = "The customer's picture couldn't be found.";
        continue;
      }
      const file = await printFile(pic, line);
      const path = `print/${job.shopify_order_id}/${line.lineId}.jpg`;
      await putObject("shop-uploads", path, file, "image/jpeg");
      const url = await signedUrl("shop-uploads", path, 24 * 3600);
      if (!url) throw new Error("no signed link");
      const art = line.artworkId ? { id: line.artworkId } : await ds.uploadArtwork({ url, name: `order-${job.shopify_order_name ?? job.shopify_order_id}-line-${line.lineId}` });
      line.artworkId = art.id;
      await ds.setLineArtwork(order.id, dsLine.id, { printArea: line.printArea, artworkId: art.id });
      line.done = true;
      line.error = null;
    } catch (e) {
      if (e instanceof DreamshipError && e.code === "not_editable") {
        locked = true;
        line.error = "Dreamship no longer takes changes to this order.";
        break;
      }
      line.error = (e as Error).message.slice(0, 160);
    }
  }
  const base = { attempts, lines, dreamship_order_id: order.id, dreamship_status: order.status };
  if (locked) {
    job = await updateJob(job.id, { ...base, status: "needs_attention", reason: "Dreamship had already sent it to print, so the picture couldn't be set." });
    await record(job, "failed", "already_submitted");
    return job;
  }
  if (lines.every((l) => l.done)) {
    job = await updateJob(job.id, { ...base, status: "picture_set", reason: null });
    await record(job, "picture_set", null);
    return job;
  }
  if (attempts >= MAX_ATTEMPTS) {
    job = await updateJob(job.id, { ...base, status: "failed", reason: lines.find((l) => l.error)?.error ?? "Couldn't set the picture." });
    await record(job, "failed", "error");
    return job;
  }
  return updateJob(job.id, { ...base, next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(), reason: lines.find((l) => l.error)?.error ?? null });
}

/** Cron: every due job. */
export async function runDueJobs(): Promise<Record<string, number>> {
  const out: Record<string, number> = { picture_set: 0, waiting: 0, needs_attention: 0, failed: 0 };
  for (const j of await dueJobs()) {
    try {
      const r = await runJob(j.id);
      if (r) out[r.status]++;
    } catch (e) {
      console.error(`[dreamship] job failed: ${(e as Error).message}`);
      out.failed++;
    }
  }
  return out;
}

/** Retry on Settings › Printers: a failed or flagged job goes back in the queue and runs now. */
export async function retryJob(actor: { email: string }, jobId: string): Promise<PrinterJobRow | null> {
  const job = await jobById(jobId);
  if (!job || job.status === "picture_set") return job;
  await updateJob(job.id, { status: "waiting", attempts: 0, reason: null, next_attempt_at: new Date().toISOString() });
  await track("admin_printer_job_retried", { maker: job.kind === "print_file" ? (job.lines[0]?.maker ?? "app") : "dreamship", order_id: job.shopify_order_id }, { email: actor.email, actor: `super_user:${actor.email}`, ref: { type: "order", id: job.shopify_order_id } });
  return runJob(job.id);
}

export type OrderView = { id: string; kind: PrinterJobRow["kind"]; files: { lineId: string; url: string }[]; orderName: string; orderId: string; status: PrinterJobRow["status"]; reason: string | null; dreamshipOrderId: number | null; dreamshipUrl: string | null; dreamshipStatus: string | null; lines: number; linesDone: number; at: string };

/** Settings › Printers › Orders: the latest 50, with Dreamship's own status read live (shown as it is). */
export async function printerOrders(): Promise<OrderView[]> {
  const jobs = await recentJobs(50);
  let ds: Awaited<ReturnType<typeof getDreamship>> | null = null;
  try {
    ds = await getDreamship();
  } catch {
    ds = null;
  }
  return Promise.all(
    jobs.map(async (j) => {
      let live = j.dreamship_status;
      if (ds && j.kind === "dreamship_artwork" && j.dreamship_order_id) live = (await ds.order(j.dreamship_order_id).catch(() => null))?.status ?? live;
      return { id: j.id, kind: j.kind, files: j.lines.flatMap((l) => (l.fileUrl ? [{ lineId: l.lineId, url: l.fileUrl }] : [])), orderName: j.shopify_order_name ?? j.shopify_order_id, orderId: j.shopify_order_id, status: j.status, reason: j.reason, dreamshipOrderId: j.dreamship_order_id, dreamshipUrl: j.dreamship_order_id ? orderUrl(j.dreamship_order_id) : null, dreamshipStatus: live, lines: j.lines.length, linesDone: j.lines.filter((l) => l.done).length, at: j.updated_at };
    }),
  );
}
