import "server-only";
import { db, must } from "./client";
import type { ShopImageKind } from "@/lib/shop/images";

/** The shop's own rows (docs/schema.md › shop_*). Every read and write is scoped to the owner's email. */

export type ShopImageRow = {
  id: string;
  owner_email: string;
  kind: ShopImageKind;
  source_url: string | null;
  storage_path: string | null;
  source_ref: string | null;
  source_session: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

const COLS = "id, owner_email, kind, source_url, storage_path, source_ref, source_session, width, height, created_at";
const norm = (e: string) => e.trim().toLowerCase();

export async function insertNewUpload(email: string, input: { id: string; storagePath: string; width: number; height: number }): Promise<ShopImageRow> {
  return must(
    await db().from("shop_images").insert({ id: input.id, owner_email: norm(email), kind: "new_upload", storage_path: input.storagePath, width: input.width, height: input.height }).select(COLS).single(),
    "insert shop upload",
  ) as ShopImageRow;
}

export async function newUploadsFor(email: string, limit = 200): Promise<ShopImageRow[]> {
  return must(await db().from("shop_images").select(COLS).eq("owner_email", norm(email)).eq("kind", "new_upload").order("created_at", { ascending: false }).limit(limit), "list shop uploads") as ShopImageRow[];
}

/** Sizes we already measured for this person's external pictures, by URL. */
export async function knownSizes(email: string, urls: string[]): Promise<Map<string, { width: number; height: number; id: string }>> {
  const out = new Map<string, { width: number; height: number; id: string }>();
  if (!urls.length) return out;
  const rows = must(await db().from("shop_images").select("id, source_url, width, height").eq("owner_email", norm(email)).in("source_url", urls.slice(0, 500)), "shop image sizes") as Pick<ShopImageRow, "id" | "source_url" | "width" | "height">[];
  for (const r of rows) if (r.source_url && r.width && r.height) out.set(r.source_url, { width: r.width, height: r.height, id: r.id });
  return out;
}

/** Records an external picture the person used (its size, once measured). Returns our row id. */
export async function rememberExternalImage(email: string, input: { kind: Exclude<ShopImageKind, "new_upload">; url: string; ref: string | null; session?: string | null; width: number | null; height: number | null }): Promise<string> {
  const row = must(
    await db()
      .from("shop_images")
      .upsert({ owner_email: norm(email), kind: input.kind, source_url: input.url, source_ref: input.ref, source_session: input.session ?? null, width: input.width, height: input.height }, { onConflict: "owner_email,source_url" })
      .select("id")
      .single(),
    "remember shop image",
  ) as { id: string };
  return row.id;
}

export async function newUploadById(email: string, id: string): Promise<ShopImageRow | null> {
  const r = await db().from("shop_images").select(COLS).eq("id", id).eq("owner_email", norm(email)).eq("kind", "new_upload").maybeSingle();
  return (r.data as ShopImageRow | null) ?? null;
}

/** Data deletion (Settings › Customers): every shop row for the email; returns upload paths to remove. */
export async function deleteShopRows(email: string): Promise<{ uploadPaths: string[]; carts: number; images: number }> {
  const e = norm(email);
  const first = await db().from("shop_images").select("id, storage_path").eq("owner_email", e);
  // Before the shop migration is applied there's nothing to delete; never let that break a deletion.
  if (first.error && (first.error.code === "PGRST205" || first.error.code === "42P01")) return { uploadPaths: [], carts: 0, images: 0 };
  const imgs = must(first, "shop images for delete") as { id: string; storage_path: string | null }[];
  const carts = must(await db().from("shop_carts").delete().eq("owner_email", e).select("id"), "delete shop carts") as { id: string }[];
  must(await db().from("shop_images").delete().eq("owner_email", e).select("id"), "delete shop images");
  return { uploadPaths: imgs.map((i) => i.storage_path).filter((p): p is string => Boolean(p)), carts: carts.length, images: imgs.length };
}

// ---------------------------------------------------------------- carts

export type ShopCartRow = {
  id: string;
  owner_email: string;
  status: "open" | "checked_out" | "paid" | "expired";
  customer_type: "normal" | "vip";
  discount_code: string | null;
  shopify_cart_id: string | null;
  shopify_checkout_url: string | null;
  gift_for: string | null;
  gift_message: string | null;
  paid_order_id: string | null;
  checked_out_at: string | null;
  updated_at: string;
  created_at: string;
};
export type ShopLineRow = {
  id: string;
  cart_id: string;
  page: "gifts" | "products";
  product_id: string;
  variant_id: string;
  quantity: number;
  image_id: string;
  crop: { x: number; y: number; w: number; h: number } | null;
  rules_version: string | null;
  template_version: string | null;
  shopify_line_id: string | null;
  preview_path: string | null;
  created_at: string;
};

const CART_COLS = "id, owner_email, status, customer_type, discount_code, shopify_cart_id, shopify_checkout_url, gift_for, gift_message, paid_order_id, checked_out_at, updated_at, created_at";
const LINE_COLS = "id, cart_id, page, product_id, variant_id, quantity, image_id, crop, rules_version, template_version, shopify_line_id, preview_path, created_at";

export async function openCartFor(email: string): Promise<ShopCartRow | null> {
  const r = await db().from("shop_carts").select(CART_COLS).eq("owner_email", norm(email)).eq("status", "open").maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return (r.data as ShopCartRow | null) ?? null;
}

/** The person's open cart, made if there's none (one open cart per email, by a unique index). */
export async function ensureOpenCart(email: string, init: { customerType: "normal" | "vip"; discountCode: string | null }): Promise<ShopCartRow> {
  const have = await openCartFor(email);
  if (have) return have;
  const ins = await db().from("shop_carts").insert({ owner_email: norm(email), customer_type: init.customerType, discount_code: init.discountCode }).select(CART_COLS).single();
  if (ins.error?.code === "23505") return (await openCartFor(email))!;
  return must(ins, "create shop cart") as ShopCartRow;
}

export async function cartLines(cartId: string): Promise<ShopLineRow[]> {
  return must(await db().from("shop_cart_lines").select(LINE_COLS).eq("cart_id", cartId).order("created_at"), "shop cart lines") as ShopLineRow[];
}

export async function insertLine(row: Omit<ShopLineRow, "created_at" | "shopify_line_id">): Promise<ShopLineRow> {
  return must(await db().from("shop_cart_lines").insert(row).select(LINE_COLS).single(), "add shop line") as ShopLineRow;
}

/** A line, only when it sits in this person's open cart. */
export async function ownLine(email: string, lineId: string): Promise<{ cart: ShopCartRow; line: ShopLineRow } | null> {
  const cart = await openCartFor(email);
  if (!cart) return null;
  const r = await db().from("shop_cart_lines").select(LINE_COLS).eq("id", lineId).eq("cart_id", cart.id).maybeSingle();
  return r.data ? { cart, line: r.data as ShopLineRow } : null;
}

export async function updateLine(lineId: string, patch: Partial<Pick<ShopLineRow, "quantity" | "shopify_line_id" | "preview_path">>) {
  must(await db().from("shop_cart_lines").update(patch).eq("id", lineId).select("id"), "update shop line");
}

export async function deleteLine(lineId: string) {
  must(await db().from("shop_cart_lines").delete().eq("id", lineId).select("id"), "remove shop line");
}

export async function updateCart(cartId: string, patch: Partial<Omit<ShopCartRow, "id" | "owner_email" | "created_at" | "updated_at">>) {
  must(await db().from("shop_carts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cartId).select("id"), "update shop cart");
}

/** The image row behind a line, for its owner only. */
export async function imageRowById(email: string, id: string): Promise<ShopImageRow | null> {
  const r = await db().from("shop_images").select(COLS).eq("id", id).eq("owner_email", norm(email)).maybeSingle();
  return (r.data as ShopImageRow | null) ?? null;
}

/** orders/paid: the cart with this id becomes paid (once). Returns it when it changed. */
export async function markCartPaid(cartId: string, orderId: string): Promise<ShopCartRow | null> {
  const r = await db().from("shop_carts").update({ status: "paid", paid_order_id: orderId, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", cartId).neq("status", "paid").select(CART_COLS).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return (r.data as ShopCartRow | null) ?? null;
}

/** Cron: open carts nobody has touched for `days` are emptied and marked expired. */
export async function expireCarts(days: number): Promise<number> {
  const before = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = must(await db().from("shop_carts").update({ status: "expired" }).eq("status", "open").lt("updated_at", before).select("id"), "expire shop carts") as { id: string }[];
  if (r.length) must(await db().from("shop_cart_lines").delete().in("cart_id", r.map((c) => c.id)).select("id"), "clear expired lines");
  return r.length;
}

/** A line for the fulfilment side's fresh-link endpoint (no owner: it's authorised by a shared secret). */
export async function lineForFulfilment(lineId: string): Promise<{ line: ShopLineRow; image: ShopImageRow } | null> {
  const l = await db().from("shop_cart_lines").select(LINE_COLS).eq("id", lineId).maybeSingle();
  if (!l.data) return null;
  const line = l.data as ShopLineRow;
  const i = await db().from("shop_images").select(COLS).eq("id", line.image_id).maybeSingle();
  return i.data ? { line, image: i.data as ShopImageRow } : null;
}
