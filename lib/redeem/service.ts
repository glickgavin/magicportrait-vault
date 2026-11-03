import "server-only";
import { getSettings } from "@/lib/settings";
import { getSources } from "@/lib/sources";
import type { ShopifyOrder } from "@/lib/sources/types";
import { findOwnedOrder } from "./access";
import { dedupeByTile, parseRedeemOrder, type ParsedOrder, type RedeemConfig, type RedeemPortrait } from "./order";
import { mugChoiceValue, mugLockState, type LockState } from "./lock";
import { track } from "@/lib/track";
import { maskEmail } from "@/lib/utils";

export async function redeemConfig(): Promise<RedeemConfig & { s: Awaited<ReturnType<typeof loadRedeemSettings>> }> {
  const s = await loadRedeemSettings();
  return {
    downloadProductIds: s["redeem.download_product_ids"],
    hiresAttrKey: s["redeem.hires_addon_attr_key"],
    hiresAttrValue: s["redeem.hires_addon_attr_value"],
    masterpieceAttrKey: s["redeem.masterpiece_attr_key"],
    masterpieceAttrValue: s["redeem.masterpiece_attr_value"],
    mugAttrKey: s["redeem.mug_gift_attr_key"],
    mugAttrValue: s["redeem.mug_gift_attr_value"],
    mugLineTileAttrKey: s["redeem.mug_line_tile_attr_key"],
    noneSelected: s["redeem.mug_none_selected_value"],
    tileIdKey: s["redeem.tile_id_attr_key"],
    masterpieceImageIdKey: s["redeem.masterpiece_image_id_attr_key"],
    imageUrlKey: s["redeem.image_url_attr_key"],
    themeKey: s["redeem.theme_attr_key"],
    s,
  };
}

function loadRedeemSettings() {
  return getSettings([
    "redeem.download_product_ids",
    "redeem.hires_addon_attr_key",
    "redeem.hires_addon_attr_value",
    "redeem.masterpiece_attr_key",
    "redeem.masterpiece_attr_value",
    "redeem.mug_gift_attr_key",
    "redeem.mug_gift_attr_value",
    "redeem.mug_line_tile_attr_key",
    "redeem.mug_none_selected_value",
    "redeem.tile_id_attr_key",
    "redeem.masterpiece_image_id_attr_key",
    "redeem.image_url_attr_key",
    "redeem.theme_attr_key",
    "redeem.downloads_enabled",
    "redeem.mug_offer_active",
    "redeem.mug_lock_mode",
    "redeem.mug_lock_days",
    "redeem.mug_lock_states",
    "redeem.mug_metafield_namespace",
    "redeem.mug_metafield_key",
    "redeem.mug_metafield_type",
    "redeem.mug_choice_source",
    "redeem.mug_ready_tag",
    "redeem.file_name_template",
    "redeem.file_default_theme",
    "redeem.zip_name_template",
    "redeem.allowed_image_hosts",
    "redeem.download_rate_limit_per_hour",
  ] as const);
}

export type OrderView = {
  order: ShopifyOrder;
  parsed: ParsedOrder;
  mugPortraits: RedeemPortrait[];
  lock: LockState;
  mugEditable: boolean;
  downloadsEnabled: boolean;
  chips: { mugChoose: boolean; downloads: number; mugPrinted: boolean; fulfillment: string | null; cancelled: boolean };
};

export async function viewOrder(order: ShopifyOrder, now = new Date()): Promise<OrderView> {
  const cfg = await redeemConfig();
  const parsed = parseRedeemOrder(order, cfg);
  const { mirror } = await getSources();
  const jobs = parsed.mug.present ? await mirror.mugJobs(order.legacyId).catch(() => []) : [];
  const lock = mugLockState({
    order,
    mugLineItemId: parsed.mug.lineItemId,
    jobs,
    mode: cfg.s["redeem.mug_lock_mode"],
    lockStates: cfg.s["redeem.mug_lock_states"],
    lockDays: cfg.s["redeem.mug_lock_days"],
    now,
  });
  const downloadsEnabled = parsed.downloads.enabled && cfg.s["redeem.downloads_enabled"] && !order.cancelledAt;
  return {
    order,
    parsed,
    mugPortraits: dedupeByTile(parsed.portraits),
    lock,
    mugEditable: parsed.mug.present && !lock.locked && cfg.s["redeem.mug_offer_active"],
    downloadsEnabled,
    chips: {
      mugChoose: parsed.mug.present && !parsed.mug.currentTileId && !lock.locked,
      downloads: downloadsEnabled ? parsed.portraits.length : 0,
      mugPrinted: lock.reason === "printing" || lock.reason === "fulfilled",
      fulfillment: order.fulfillmentStatus,
      cancelled: Boolean(order.cancelledAt),
    },
  };
}

export async function loadOwnedOrderView(email: string, orderParam: string): Promise<OrderView | null> {
  const order = await findOwnedOrder(email, orderParam);
  return order ? viewOrder(order) : null;
}

export type MugSaveError = "not_found" | "no_mug" | "locked" | "cancelled" | "closed" | "invalid_tile" | "save_failed";
export type MugSaveResult = { ok: true; tileId: string } | { ok: false; status: 404 | 409 | 422 | 502; error: MugSaveError };

/**
 * Saves the free-mug photo (docs/data.md §6.4): owned, has a mug, not cancelled, not locked,
 * the tile is one of this order's portraits; then metafieldsSet (with compareDigest) and tagsAdd.
 */
export async function saveMugChoice(email: string, orderParam: string, tileId: string): Promise<MugSaveResult> {
  const order = await findOwnedOrder(email, orderParam);
  if (!order) return { ok: false, status: 404, error: "not_found" };
  const view = await viewOrder(order);
  const cfg = await redeemConfig();
  const orderId = order.legacyId;
  const fail = async (status: 409 | 422 | 502, error: MugSaveError): Promise<MugSaveResult> => {
    await track("redeem_mug_save_failed", { order_id: orderId, tile_id: tileId, reason: error }, { email, ref: { type: "order", id: orderId } });
    return { ok: false, status, error };
  };
  if (!view.parsed.mug.present) return fail(409, "no_mug");
  if (order.cancelledAt) return fail(409, "cancelled");
  if (view.lock.locked) return fail(409, "locked");
  if (!cfg.s["redeem.mug_offer_active"]) return fail(409, "closed");
  const portrait = view.parsed.portraits.filter((p) => p.tileId === tileId).pop();
  if (!portrait) return fail(422, "invalid_tile");

  const { shopify } = await getSources();
  const value = mugChoiceValue(tileId, portrait.imageUrl, cfg.s["redeem.mug_choice_source"], new Date());
  const set = await shopify
    .setMugChoice({
      orderGid: order.id,
      namespace: cfg.s["redeem.mug_metafield_namespace"],
      key: cfg.s["redeem.mug_metafield_key"],
      type: cfg.s["redeem.mug_metafield_type"],
      value,
      compareDigest: order.mugChoice?.compareDigest ?? null,
    })
    .catch((e: Error) => ({ ok: false as const, reason: e.message }));
  if (!set.ok) {
    console.error(`[redeem] metafieldsSet failed for order ${orderId} (${maskEmail(email)}): ${set.reason}`);
    return fail(502, "save_failed");
  }
  const tag = await shopify.addTags(order.id, [cfg.s["redeem.mug_ready_tag"]]).catch((e: Error) => ({ ok: false as const, reason: e.message }));
  if (!tag.ok) await track("redeem_mug_save_failed", { order_id: orderId, tile_id: tileId, reason: "tag_failed" }, { email, ref: { type: "order", id: orderId } });
  await track("redeem_mug_saved", { order_id: orderId, order_name: order.name, tile_id: tileId, is_first_save: !view.parsed.mug.currentTileId }, { email, ref: { type: "order", id: orderId } });
  return { ok: true, tileId };
}
