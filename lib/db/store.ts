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
  posthog_distinct_id: string | null;
  first_touch: Record<string, unknown> | null;
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
  email_to?: string | null;
  emailed_at?: string | null;
  created_at: string;
  finished_at: string | null;
};

const V_COLS = "id, email, linked_via, email_given, shopify_cart_id, shopify_checkout_url, posthog_distinct_id, first_touch, created_at, last_seen_at";
const P_COLS = "id, visitor_id, storage_path, width, height, created_at";
const G_COLS = "id, visitor_id, product_id, theme, photo_ids, names, imagen_session_id, status, images, chosen_index, cost_usd, order_id, email_to, emailed_at, created_at, finished_at";

export async function visitorByHash(tokenHash: string): Promise<StoreVisitorRow | null> {
  const r = await db().from("store_visitors").select(V_COLS).eq("token_hash", tokenHash).maybeSingle();
  return (r.data as StoreVisitorRow | null) ?? null;
}

/** Creates the visitor on their first real action; a second request with the same cookie gets the same row. */
export async function createVisitor(tokenHash: string, extra: { firstTouch?: Record<string, unknown> | null; posthogId?: string | null } = {}): Promise<StoreVisitorRow> {
  must(await db().from("store_visitors").upsert({ token_hash: tokenHash, first_touch: extra.firstTouch ?? null, posthog_distinct_id: extra.posthogId ?? null }, { onConflict: "token_hash", ignoreDuplicates: true }), "create store visitor");
  const row = await visitorByHash(tokenHash);
  if (!row) throw new Error("create store visitor: not found after insert");
  return row;
}

/** True when this visitor is linked to this (proven) email. */
export async function visitorLinkedTo(visitorId: string, email: string): Promise<boolean> {
  const r = await db().from("store_visitors").select("id").eq("id", visitorId).eq("email", email.trim().toLowerCase()).maybeSingle();
  return Boolean(r.data);
}

/** The PostHog id the browser sent (so server events and paid orders credit the same person). */
export async function setVisitorPosthogId(id: string, posthogId: string): Promise<void> {
  await db().from("store_visitors").update({ posthog_distinct_id: posthogId }).eq("id", id);
}

/** For the person properties: pictures made and orders paid by this visitor. */
export async function visitorCounts(visitorId: string): Promise<{ pictures: number; orders: number }> {
  const r = await db().from("store_generations").select("order_id").eq("visitor_id", visitorId).limit(5000);
  const rows = (r.data ?? []) as { order_id: string | null }[];
  return { pictures: rows.length, orders: new Set(rows.flatMap((x) => (x.order_id ? [x.order_id] : []))).size };
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

// ---------------------------------------------------------------- Open store 4: cart, linking, ordered, email

export async function setVisitorCart(visitorId: string, cart: { id: string | null; checkoutUrl: string | null }): Promise<void> {
  must(await db().from("store_visitors").update({ shopify_cart_id: cart.id, shopify_checkout_url: cart.checkoutUrl }).eq("id", visitorId), "set store visitor cart");
}

export async function visitorById(id: string): Promise<StoreVisitorRow | null> {
  const r = await db().from("store_visitors").select(V_COLS).eq("id", id).maybeSingle();
  return (r.data as StoreVisitorRow | null) ?? null;
}

/** Every visitor linked to this (proven) email, newest first. */
export async function visitorsForEmail(email: string): Promise<StoreVisitorRow[]> {
  return must(await db().from("store_visitors").select(V_COLS).eq("email", email.trim().toLowerCase()).order("last_seen_at", { ascending: false }).limit(50), "store visitors for email") as StoreVisitorRow[];
}

/** Links a visitor to a proven email, only if it has none yet. True when it was linked now. */
export async function linkVisitorEmail(visitorId: string, email: string, via: "sign_in" | "order" | "email_link"): Promise<boolean> {
  const r = await db().from("store_visitors").update({ email: email.trim().toLowerCase(), linked_via: via }).eq("id", visitorId).is("email", null).select("id");
  return Boolean(r.data?.length);
}

/** The typed (unproven) email while painting, and the marketing tick. */
export async function setEmailGiven(visitorId: string, email: string, consent: boolean): Promise<void> {
  const now = new Date().toISOString();
  must(await db().from("store_visitors").update({ email_given: email.trim().toLowerCase(), email_given_at: now, ...(consent ? { marketing_consent_at: now } : {}) }).eq("id", visitorId), "set store email given");
}

/** Pictures ordered: by Imagen session id, only this visitor's (an order can't mark someone else's). */
export async function markGenerationsOrdered(visitorId: string, sessionIds: string[], orderId: string): Promise<number> {
  if (!sessionIds.length) return 0;
  const r = await db().from("store_generations").update({ order_id: orderId, ordered_at: new Date().toISOString() }).eq("visitor_id", visitorId).in("imagen_session_id", sessionIds).is("order_id", null).select("id");
  return r.data?.length ?? 0;
}

export async function generationsMadeBy(visitorId: string): Promise<number> {
  const r = await db().from("store_generations").select("id", { count: "exact", head: true }).eq("visitor_id", visitorId);
  return r.count ?? 0;
}

/** Records who asked for the picture by email; false when it was already asked for (one email per picture). */
export async function requestPictureEmail(generationId: string, email: string, consent: boolean): Promise<boolean> {
  const r = await db().from("store_generations").update({ email_to: email.trim().toLowerCase(), email_consent: consent }).eq("id", generationId).is("email_to", null).select("id");
  return Boolean(r.data?.length);
}

/** Claims the picture's one email (so two status checks can't both send it). */
export async function claimPictureEmail(generationId: string): Promise<{ email_to: string; email_consent: boolean } | null> {
  const r = await db().from("store_generations").update({ emailed_at: new Date().toISOString() }).eq("id", generationId).eq("status", "done").not("email_to", "is", null).is("emailed_at", null).select("email_to, email_consent").maybeSingle();
  return (r.data as { email_to: string; email_consent: boolean } | null) ?? null;
}

/** "Your picture is ready" emails to one address since `since` (the per-address daily limit). */
export async function picturesEmailedTo(email: string, since: Date): Promise<number> {
  const r = await db().from("store_generations").select("id", { count: "exact", head: true }).eq("email_to", email.trim().toLowerCase()).gte("emailed_at", since.toISOString());
  return r.count ?? 0;
}

// ---------------------------------------------------------------- Open store 5: numbers for Settings › Shop › Magic Store

export type NumbersGeneration = Pick<StoreGenerationRow, "visitor_id" | "product_id" | "theme" | "status" | "created_at" | "finished_at" | "cost_usd" | "order_id"> & { email_to: string | null; email_consent: boolean };
export type NumbersVisitor = { id: string; created_at: string; first_touch: Record<string, unknown> | null };
export type NumbersActivity = { event: string; created_at: string; props: Record<string, unknown> };

/** Everything the numbers need since `since` (our own tables only, so they never depend on PostHog). */
export async function storeNumbersData(since: Date): Promise<{ generations: NumbersGeneration[]; visitors: NumbersVisitor[]; activity: NumbersActivity[] }> {
  const iso = since.toISOString();
  const [g, v, a] = await Promise.all([
    db().from("store_generations").select("visitor_id, product_id, theme, status, created_at, finished_at, cost_usd, order_id, email_to, email_consent").gte("created_at", iso).limit(50000),
    db().from("store_visitors").select("id, created_at, first_touch").gte("created_at", iso).limit(50000),
    db().from("activity_log").select("event, created_at, props").in("event", ["store_added_to_cart", "store_order_paid"]).gte("created_at", iso).limit(50000),
  ]);
  return { generations: (g.data ?? []) as NumbersGeneration[], visitors: (v.data ?? []) as NumbersVisitor[], activity: (a.data ?? []) as NumbersActivity[] };
}

/** First touch for visitors made before it was recorded on them, by id (for orders whose visitor is older than the window). */
export async function visitorFirstTouches(ids: string[]): Promise<Map<string, Record<string, unknown> | null>> {
  const out = new Map<string, Record<string, unknown> | null>();
  if (!ids.length) return out;
  const r = await db().from("store_visitors").select("id, first_touch").in("id", ids.slice(0, 1000));
  for (const row of (r.data ?? []) as { id: string; first_touch: Record<string, unknown> | null }[]) out.set(row.id, row.first_touch);
  return out;
}

/** The size of a recent picture made with this Imagen theme (for Dreamship's dpi check), or null when none was made. */
export async function recentPictureSize(theme: string): Promise<{ width: number; height: number } | null> {
  const r = await db().from("store_generations").select("images").eq("theme", theme).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const img = ((r.data as { images: { width: number; height: number }[] } | null)?.images ?? [])[0];
  return img?.width && img?.height ? { width: img.width, height: img.height } : null;
}
