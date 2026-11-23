import "server-only";
import { db, must } from "./client";

/** The open store's own rows (docs/open-store.md › Visitors and saved data). Callers check ownership first. */

export type StoreVisitorRow = {
  id: string;
  email: string | null;
  linked_via: "sign_in" | "order" | "email_link" | null;
  email_given: string | null;
  shopify_cart_id: string | null;
  shopify_checkout_url: string | null;
  created_at: string;
  last_seen_at: string;
};

export type StorePhotoRow = { id: string; visitor_id: string; storage_path: string; width: number; height: number; created_at: string };

export type StoreGenerationStatus = "pending" | "preprocessing" | "generating" | "done" | "failed" | "timed_out";
export type StoreGenerationImage = { imagen_id: string; url: string; width: number; height: number; storage_path: string | null };
export type StoreGenerationRow = {
  id: string;
  visitor_id: string;
  product_id: string;
  theme: string;
  photo_ids: string[];
  names: string[];
  imagen_session_id: string | null;
  status: StoreGenerationStatus;
  images: StoreGenerationImage[];
  chosen_index: number;
  cost_usd: number | null;
  order_id: string | null;
  created_at: string;
  finished_at: string | null;
};

const V_COLS = "id, email, linked_via, email_given, shopify_cart_id, shopify_checkout_url, created_at, last_seen_at";
const P_COLS = "id, visitor_id, storage_path, width, height, created_at";
const G_COLS = "id, visitor_id, product_id, theme, photo_ids, names, imagen_session_id, status, images, chosen_index, cost_usd, order_id, created_at, finished_at";

export async function visitorByHash(tokenHash: string): Promise<StoreVisitorRow | null> {
  const r = await db().from("store_visitors").select(V_COLS).eq("token_hash", tokenHash).maybeSingle();
  return (r.data as StoreVisitorRow | null) ?? null;
}

/** Creates the visitor on their first real action; a second request with the same cookie gets the same row. */
export async function createVisitor(tokenHash: string): Promise<StoreVisitorRow> {
  must(await db().from("store_visitors").upsert({ token_hash: tokenHash }, { onConflict: "token_hash", ignoreDuplicates: true }), "create store visitor");
  const row = await visitorByHash(tokenHash);
  if (!row) throw new Error("create store visitor: not found after insert");
  return row;
}

/** True when this visitor is linked to this (proven) email. */
export async function visitorLinkedTo(visitorId: string, email: string): Promise<boolean> {
  const r = await db().from("store_visitors").select("id").eq("id", visitorId).eq("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(r.data);
}

export async function touchVisitor(id: string): Promise<void> {
  await db().from("store_visitors").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}

export async function insertStorePhoto(input: { id: string; visitorId: string; storagePath: string; width: number; height: number }): Promise<StorePhotoRow> {
  return must(await db().from("store_photos").insert({ id: input.id, visitor_id: input.visitorId, storage_path: input.storagePath, width: input.width, height: input.height }).select(P_COLS).single(), "insert store photo") as StorePhotoRow;
}

export async function storePhotoById(id: string): Promise<StorePhotoRow | null> {
  const r = await db().from("store_photos").select(P_COLS).eq("id", id).maybeSingle();
  return (r.data as StorePhotoRow | null) ?? null;
}

export async function storePhotosFor(visitorIds: string[], limit = 12): Promise<StorePhotoRow[]> {
  if (!visitorIds.length) return [];
  return must(await db().from("store_photos").select(P_COLS).in("visitor_id", visitorIds).order("created_at", { ascending: false }).limit(limit), "list store photos") as StorePhotoRow[];
}

export async function insertGeneration(input: { visitorId: string; productId: string; theme: string; photoIds: string[]; names: string[]; ipHash: string; sessionId: string; status: StoreGenerationStatus }): Promise<StoreGenerationRow> {
  return must(
    await db()
      .from("store_generations")
      .insert({ visitor_id: input.visitorId, product_id: input.productId, theme: input.theme, photo_ids: input.photoIds, names: input.names, ip_hash: input.ipHash, imagen_session_id: input.sessionId, status: input.status })
      .select(G_COLS)
      .single(),
    "insert store generation",
  ) as StoreGenerationRow;
}

export async function generationById(id: string): Promise<StoreGenerationRow | null> {
  const r = await db().from("store_generations").select(G_COLS).eq("id", id).maybeSingle();
  return (r.data as StoreGenerationRow | null) ?? null;
}

export async function updateGeneration(id: string, patch: Partial<Pick<StoreGenerationRow, "status" | "images" | "chosen_index" | "cost_usd" | "finished_at">>): Promise<StoreGenerationRow> {
  return must(await db().from("store_generations").update(patch).eq("id", id).select(G_COLS).single(), "update store generation") as StoreGenerationRow;
}

/** The newest finished picture these visitors made (for one product, or any). */
export async function latestDoneGeneration(visitorIds: string[], productId?: string): Promise<StoreGenerationRow | null> {
  if (!visitorIds.length) return null;
  let q = db().from("store_generations").select(G_COLS).in("visitor_id", visitorIds).eq("status", "done");
  if (productId) q = q.eq("product_id", productId);
  const r = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (r.data as StoreGenerationRow | null) ?? null;
}

/** Pictures counted toward the day's limits: everything since `since` that didn't fail or time out. */
export async function countGenerations(filter: { since: Date; visitorId?: string; ipHash?: string }): Promise<number> {
  let q = db().from("store_generations").select("id", { count: "exact", head: true }).gte("created_at", filter.since.toISOString()).not("status", "in", "(failed,timed_out)");
  if (filter.visitorId) q = q.eq("visitor_id", filter.visitorId);
  if (filter.ipHash) q = q.eq("ip_hash", filter.ipHash);
  const r = await q;
  if (r.error) throw new Error(`count store generations: ${r.error.message}`);
  return r.count ?? 0;
}

/** Today's numbers for Settings › Shop › Magic Store. */
export async function generationStats(since: Date): Promise<{ made: number; done: number; failed: number; costUsd: number }> {
  const rows = must(await db().from("store_generations").select("status, cost_usd").gte("created_at", since.toISOString()).limit(20000), "store generation stats") as { status: StoreGenerationStatus; cost_usd: number | null }[];
  return {
    made: rows.length,
    done: rows.filter((r) => r.status === "done").length,
    failed: rows.filter((r) => r.status === "failed" || r.status === "timed_out").length,
    costUsd: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0),
  };
}
