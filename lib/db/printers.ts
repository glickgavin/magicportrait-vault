import "server-only";
import { db, must } from "./client";

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
