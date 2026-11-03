/** The mug lock rule (docs/data.md §6.6, setting redeem.mug_lock_mode). Pure. */
import type { MugJob, ShopifyOrder } from "@/lib/sources/types";
import { legacyIdOf } from "./order";

export type LockInput = {
  order: Pick<ShopifyOrder, "cancelledAt" | "createdAt" | "lineItems">;
  mugLineItemId: string | null;
  jobs: MugJob[];
  mode: "print_status" | "days_after_order";
  lockStates: string[];
  lockDays: number;
  now: Date;
};

export type LockState = { locked: boolean; reason: "cancelled" | "printing" | "fulfilled" | "days" | null; printed: boolean };

export function mugLockState(i: LockInput): LockState {
  if (i.order.cancelledAt) return { locked: true, reason: "cancelled", printed: false };
  const mugLine = i.order.lineItems.find((l) => l.id === i.mugLineItemId);
  const mugLegacy = i.mugLineItemId ? legacyIdOf(i.mugLineItemId) : null;
  const job = i.jobs.find((j) => j.shopifyLineItemId === mugLegacy) ?? null;
  const printing = Boolean(job && (i.lockStates.includes(job.state) || job.gelatoOrderId));
  const fulfilled = Boolean(mugLine && mugLine.unfulfilledQuantity === 0);
  // Rules 1 and 2 always apply: once printing starts or the mug line is fulfilled, it's locked.
  if (printing) return { locked: true, reason: "printing", printed: true };
  if (fulfilled) return { locked: true, reason: "fulfilled", printed: true };
  if (i.mode === "days_after_order" && i.now.getTime() > new Date(i.order.createdAt).getTime() + i.lockDays * 86_400_000) return { locked: true, reason: "days", printed: false };
  return { locked: false, reason: null, printed: false };
}

/** The live metafield value, byte-compatible with the live /redeem: same keys, same order (docs/data.md §5.4). */
export function mugChoiceValue(tileId: string, imageUrl: string, source: string, now: Date): string {
  return JSON.stringify({ tile_id: tileId, image_url: imageUrl, source, updated_at: now.toISOString() });
}

/** File names from the live redeem (docs/data.md §4.6). */
export function extFromContentType(ct: string | null | undefined): string {
  const c = (ct ?? "").toLowerCase();
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  if (c.includes("tiff")) return "tiff";
  return "jpg";
}

export function themeSlug(theme: string | null | undefined, fallback: string): string {
  return (theme || fallback).replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

export function fileName(template: string, theme: string | null | undefined, fallback: string, n: number, ext: string): string {
  return template.replace("{theme}", themeSlug(theme, fallback)).replace("{n}", String(n)).replace("{ext}", ext);
}

export function zipName(template: string, orderName: string): string {
  return template.replace("{orderName}", (orderName || "order").replace(/[^a-z0-9#-]+/gi, "-"));
}
