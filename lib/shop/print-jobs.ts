import "server-only";
import { z } from "zod";
import { jobById, queuePrinterJob, updateJob, type JobLine, type PrinterJobRow } from "@/lib/db/printers";
import { getSettings } from "@/lib/settings";
import { getSources } from "@/lib/sources";
import { putObject, signedUrl } from "@/lib/storage";
import { track } from "@/lib/track";
import { adminProducts } from "./index";
import { layerActive, layerValuesFromProps } from "./layer";
import { composePrintFile } from "./print-file";
import { parseTemplate } from "./template";

/**
 * Print files for personalised lines (docs/shop.md › Personalisation layer, docs/data.md › Print files). The print
 * system builds a plain line's file itself from `_image_url` and `_shop_crop`; it can't draw the customer's words.
 * So for a paid order with personalised lines made by anyone but Dreamship (Dreamship's own job sets the composed
 * file on its order), the app composes each file (picture + layer, at print size), keeps it, and links them all from
 * the order's `mmp_shop.print_files` metafield as `{ "<Shopify line id>": "<link>" }` (CLAUDE.md allowed write 1).
 */
export const PRINT_FILES_KEY = "print_files";

const prop = z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable().transform((v) => (v === null ? null : String(v))) });
const paidSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional().nullable(),
  line_items: z.array(z.object({ id: z.union([z.number(), z.string()]).transform(String), product_id: z.union([z.number(), z.string()]).nullable().optional(), quantity: z.number().default(1), properties: z.array(prop).optional().nullable() }).passthrough()).default([]),
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

/** The order's personalised lines for printers other than Dreamship (pure, so a test can pin it). */
export function layeredLines(payload: unknown): { orderId: string; name: string | null; lines: JobLine[] } | null {
  const p = paidSchema.safeParse(payload);
  if (!p.success) return null;
  const lines: JobLine[] = [];
  for (const li of p.data.line_items) {
    const props = Object.fromEntries((li.properties ?? []).map((x) => [x.name, x.value ?? ""]));
    if (props._shop !== "true" || props._shop_maker === "dreamship") continue;
    const values = layerValuesFromProps(props);
    const printPx = pxOf(props._shop_print_px);
    if (!values || !printPx || !li.product_id) continue;
    const picture: JobLine["picture"] | null =
      props._shop_page === "open_store" && props._shop_session_id && props._shop_image_id
        ? { kind: "open_store", sessionId: props._shop_session_id, imageId: props._shop_image_id }
        : UUID.test(props._vault_line_id ?? "")
          ? { kind: "shop", vaultLineId: props._vault_line_id }
          : null;
    if (!picture) continue;
    lines.push({ lineId: li.id, quantity: li.quantity, productVariantId: null, printArea: "", printPx, crop: cropOf(props._shop_crop), picture, productId: `gid://shopify/Product/${li.product_id}`, maker: props._shop_maker || null, layerValues: values });
  }
  return { orderId: p.data.id, name: p.data.name ?? null, lines };
}

/**
 * Each line's layer as the product's template has it now (the order was paid moments ago), kept on the job so a
 * later template change can't change the file. A line whose product no longer has a layer keeps none: flagged.
 */
export async function attachLayers(lines: JobLine[]): Promise<JobLine[]> {
  const need = lines.filter((l) => l.layerValues && l.productId);
  if (!need.length) return lines;
  const products = await adminProducts().catch(() => []);
  return lines.map((l) => {
    if (!l.layerValues || !l.productId) return l;
    const t = parseTemplate(products.find((p) => p.id === l.productId)?.template?.value);
    return { ...l, layer: layerActive(t?.layer) ? t.layer : null };
  });
}

/** orders/paid: queues one print-file job for the order when it has personalised lines for other printers. */
export async function queuePrintFiles(payload: unknown): Promise<{ queued: boolean; jobId?: string }> {
  const found = layeredLines(payload);
  if (!found || !found.lines.length) return { queued: false };
  const job = await queuePrinterJob({ kind: "print_file", shopifyOrderId: found.orderId, name: found.name, lines: await attachLayers(found.lines) });
  return { queued: true, jobId: job.id };
}

const backoffMs = (attempts: number) => Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
const MAX_ATTEMPTS = 12;

async function record(job: PrinterJobRow, status: "picture_set" | "failed", reason: string | null) {
  await track("shop_print_file_made", { maker: job.lines[0]?.maker ?? null, status, lines: job.lines.filter((l) => l.done).length, of: job.lines.length, ...(reason ? { reason } : {}) }, { source: "vault", actor: "system", ref: { type: "order", id: job.shopify_order_id } });
}

/** One attempt at a print-file job. Idempotent: lines already made are kept; the metafield is written whole each time. */
export async function runPrintFileJob(jobId: string, now = new Date()): Promise<PrinterJobRow | null> {
  let job = await jobById(jobId);
  if (!job || job.kind !== "print_file" || job.status !== "waiting") return job;
  const s = await getSettings(["shop.fulfilment_link_days", "shop.metafield_namespace", "printers.print_files_to_order"] as const);
  const attempts = job.attempts + 1;
  const lines = job.lines.map((l) => ({ ...l }));
  const { pictureFor } = await import("@/lib/dreamship/artwork");
  for (const line of lines.filter((l) => !l.done)) {
    if (!line.layer || !line.layerValues) {
      line.error = "The product no longer has a personalisation layer, so the words can't be placed.";
      continue;
    }
    try {
      const pic = await pictureFor(line);
      if (!pic) {
        line.error = "The customer's picture couldn't be found.";
        continue;
      }
      const file = await composePrintFile(pic, { crop: line.crop, printPx: line.printPx, layer: { layer: line.layer, values: line.layerValues } });
      const path = `print/${job.shopify_order_id}/${line.lineId}.jpg`;
      await putObject("shop-uploads", path, file, "image/jpeg");
      const url = await signedUrl("shop-uploads", path, s["shop.fulfilment_link_days"] * 86_400);
      if (!url) throw new Error("no signed link");
      line.fileUrl = url;
      line.done = true;
      line.error = null;
    } catch (e) {
      line.error = (e as Error).message.slice(0, 160);
    }
  }
  const missingLayer = lines.some((l) => !l.done && !l.layer);
  if (s["printers.print_files_to_order"] && lines.some((l) => l.done)) {
    // Every file made so far, linked from the order (the whole map each time, so a retry adds to it).
    const files = Object.fromEntries(lines.filter((l) => l.done && l.fileUrl).map((l) => [l.lineId, l.fileUrl!]));
    const r = await (await getSources()).shopify.setOrderPrintFiles({ orderGid: `gid://shopify/Order/${job.shopify_order_id}`, namespace: s["shop.metafield_namespace"], key: PRINT_FILES_KEY, value: JSON.stringify(files) }).catch((e: Error) => ({ ok: false as const, reason: e.message }));
    if (!r.ok) {
      for (const l of lines) if (l.done) l.error = `Shopify refused the link (${r.reason.slice(0, 80)}).`;
      return attempts >= MAX_ATTEMPTS
        ? updateJob(job.id, { attempts, lines, status: "failed", reason: "Couldn't link the print files from the order in Shopify." })
        : updateJob(job.id, { attempts, lines, next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(), reason: "Couldn't link the print files from the order in Shopify yet." });
    }
    for (const l of lines) if (l.done && l.error?.startsWith("Shopify refused")) l.error = null;
  }
  if (lines.every((l) => l.done)) {
    job = await updateJob(job.id, { attempts, lines, status: "picture_set", reason: null });
    await record(job, "picture_set", null);
    return job;
  }
  if (missingLayer) {
    job = await updateJob(job.id, { attempts, lines, status: "needs_attention", reason: lines.find((l) => !l.layer)?.error ?? "A line couldn't be made." });
    await record(job, "failed", "no_layer");
    return job;
  }
  if (attempts >= MAX_ATTEMPTS) {
    job = await updateJob(job.id, { attempts, lines, status: "failed", reason: lines.find((l) => l.error)?.error ?? "Couldn't make the print file." });
    await record(job, "failed", "error");
    return job;
  }
  return updateJob(job.id, { attempts, lines, next_attempt_at: new Date(now.getTime() + backoffMs(attempts)).toISOString(), reason: lines.find((l) => l.error)?.error ?? null });
}
