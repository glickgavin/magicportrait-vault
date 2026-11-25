import "server-only";
import { db, must } from "./client";
import type { Layer, LayerValues } from "@/lib/shop/layer";

/** Printers' own rows (docs/dreamship.md): the last Dreamship sync report per linked product. */

export type DreamshipSyncRow = { product_id: string; legacy_id: string; dreamship_product_id: number; report: unknown; warnings: number; differs: number; synced_at: string; synced_by: string };
const COLS = "product_id, legacy_id, dreamship_product_id, report, warnings, differs, synced_at, synced_by";

export async function saveSyncReport(row: Omit<DreamshipSyncRow, "synced_at">): Promise<void> {
  must(await db().from("dreamship_sync").upsert({ ...row, synced_at: new Date().toISOString() }, { onConflict: "product_id" }), "save dreamship sync");
}

export async function syncReportFor(productId: string): Promise<DreamshipSyncRow | null> {
  const r = await db().from("dreamship_sync").select(COLS).eq("product_id", productId).maybeSingle();
  return (r.data as DreamshipSyncRow | null) ?? null;
}

export async function allSyncReports(): Promise<DreamshipSyncRow[]> {
  return must(await db().from("dreamship_sync").select(COLS).limit(1000), "dreamship sync reports") as DreamshipSyncRow[];
}

// ---------------------------------------------------------------- Dreamship artwork jobs (Part B)

export type JobLine = {
  /** Shopify's line item id. */
  lineId: string;
  quantity: number;
  /** Dreamship's product variant id (from `_shop_extra`, else the Shopify SKU). */
  productVariantId: number | null;
  printArea: string;
  printPx: { w: number; h: number };
  crop: { x: number; y: number; w: number; h: number } | null;
  /** Where our copy of the picture is: an open-store picture, or a shop line. */
  picture: { kind: "open_store"; sessionId: string; imageId: string } | { kind: "shop"; vaultLineId: string };
  /** The result for this line. */
  dreamshipLineId?: number | null;
  artworkId?: number | null;
  done?: boolean;
  error?: string | null;
  /** The personalisation layer (docs/shop.md): the Shopify product, its layer as it was when the order was paid, and what the customer filled in. */
  productId?: string | null;
  layer?: Layer | null;
  layerValues?: LayerValues | null;
  /** print_file jobs: who makes it, and the link to the file the app made. */
  maker?: string | null;
  fileUrl?: string | null;
};

export type PrinterJobRow = {
  id: string;
  kind: "dreamship_artwork" | "print_file";
  shopify_order_id: string;
  shopify_order_name: string | null;
  lines: JobLine[];
  status: "waiting" | "picture_set" | "needs_attention" | "failed";
  reason: string | null;
  attempts: number;
  next_attempt_at: string;
  dreamship_order_id: number | null;
  dreamship_status: string | null;
  created_at: string;
  updated_at: string;
};
const JOB_COLS = "id, kind, shopify_order_id, shopify_order_name, lines, status, reason, attempts, next_attempt_at, dreamship_order_id, dreamship_status, created_at, updated_at";

/** Queues the job once per order (a repeated webhook changes nothing). Returns the job. */
export async function queuePrinterJob(input: { kind: PrinterJobRow["kind"]; shopifyOrderId: string; name: string | null; lines: JobLine[] }): Promise<PrinterJobRow> {
  must(await db().from("printer_jobs").upsert({ kind: input.kind, shopify_order_id: input.shopifyOrderId, shopify_order_name: input.name, lines: input.lines }, { onConflict: "kind,shopify_order_id", ignoreDuplicates: true }), "queue printer job");
  return must(await db().from("printer_jobs").select(JOB_COLS).eq("kind", input.kind).eq("shopify_order_id", input.shopifyOrderId).single(), "read printer job") as PrinterJobRow;
}

export async function jobById(id: string): Promise<PrinterJobRow | null> {
  const r = await db().from("printer_jobs").select(JOB_COLS).eq("id", id).maybeSingle();
  return (r.data as PrinterJobRow | null) ?? null;
}

export async function dueJobs(limit = 20): Promise<PrinterJobRow[]> {
  return must(await db().from("printer_jobs").select(JOB_COLS).eq("status", "waiting").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit), "due printer jobs") as PrinterJobRow[];
}

export async function updateJob(id: string, patch: Partial<Pick<PrinterJobRow, "lines" | "status" | "reason" | "attempts" | "next_attempt_at" | "dreamship_order_id" | "dreamship_status">>): Promise<PrinterJobRow> {
  return must(await db().from("printer_jobs").update(patch).eq("id", id).select(JOB_COLS).single(), "update printer job") as PrinterJobRow;
}

export async function recentJobs(limit = 50): Promise<PrinterJobRow[]> {
  return must(await db().from("printer_jobs").select(JOB_COLS).order("created_at", { ascending: false }).limit(limit), "recent printer jobs") as PrinterJobRow[];
}
