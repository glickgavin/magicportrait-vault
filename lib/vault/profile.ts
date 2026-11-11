import "server-only";
import { cache } from "react";
import { getSources } from "@/lib/sources";
import { getSettings } from "@/lib/settings";
import { getMember, upsertMember, type MemberRow } from "@/lib/db/members";
import { buildProfile, type VaultProfile } from "./profile-core";
import { maskEmail } from "@/lib/utils";
import type { ShopifyOrder } from "@/lib/sources/types";
import { afterResponse, timed } from "@/lib/perf";

export type { VaultProfile } from "./profile-core";

/**
 * What each server keeps between pages: "email|scope" → profile and when it was read. Memory only, never
 * stored. The scope is "recent" (the newest sessions and orders, what most pages show) or "all".
 */
const memory = new Map<string, { at: number; profile: VaultProfile }>();
const MEMORY_MAX = 500;
/** Reads still running, so requests arriving together for one person share them. */
const reading = new Map<string, Promise<VaultProfile>>();

/** When each person's kept profile was last dropped: a read that started before then isn't kept. */
const forgotAt = new Map<string, number>();

type Scope = "recent" | "all";
const key = (email: string, scope: Scope) => `${email}|${scope}`;

function remember(email: string, scope: Scope, profile: VaultProfile, startedAt: number) {
  if ((forgotAt.get(email) ?? 0) >= startedAt) return;
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(key(email, scope), { at: Date.now(), profile });
}

function kept(email: string, scope: Scope, keepMs: number): VaultProfile | null {
  const k = memory.get(key(email, scope));
  return k && keepMs > 0 && Date.now() - k.at < keepMs ? k.profile : null;
}

/** Drop what this server keeps for a person, after we change something their pages show (a mug choice). */
export function forgetProfile(email: string) {
  const e = email.trim().toLowerCase();
  for (const scope of ["recent", "all"] as const) {
    memory.delete(key(e, scope));
    reading.delete(key(e, scope));
  }
  if (forgotAt.size >= MEMORY_MAX) forgotAt.clear();
  forgotAt.set(e, Date.now());
}

/**
 * `all`: every session and order (Show more, card checks, Settings). Without it pages get the newest
 * `vault.recent_sessions` sessions and `vault.recent_orders` orders, with totals for the counts.
 * `refresh` always reads everything live.
 */
type ProfileOpts = { refresh?: boolean; createdVia?: MemberRow["created_via"]; memory?: boolean; all?: boolean };

/**
 * Everything we know about one person, read live: Shopify orders, Imagen portraits (via the
 * mirror's session ids, cached in vault_members for `vault.lookup_cache_minutes`) and the ordered flag.
 * Memoised per request, and kept in this server's memory for `vault.profile_memory_seconds` so moving
 * between pages doesn't read Shopify and Imagen again. `refresh` (or `memory: false`) always reads live.
 */
export const getVaultProfile = cache(async (email: string, opts: ProfileOpts = {}): Promise<VaultProfile> => {
  const e = email.trim().toLowerCase();
  if (opts.refresh || opts.memory === false) return readProfile(e, opts);
  // Requests arriving together for the same person (a page and its prefetches) share one read.
  const k = key(e, opts.all ? "all" : "recent");
  const running = reading.get(k);
  if (running) return running;
  const p = readProfile(e, opts).finally(() => reading.delete(k));
  reading.set(k, p);
  return p;
});

/** A full profile as a "newest first" one: the newest `limit` sessions shown, the totals kept. Never changes `p`. */
export function newestOf(p: VaultProfile, limit: number): VaultProfile {
  if (!limit || p.sessions.length <= limit) return p;
  const sessions = p.sessions.slice(0, limit);
  return { ...p, sessions, more: { ...p.more, sessions: Math.max(0, p.sessionCount - sessions.length) } };
}

/** True when the newest orders don't settle the free gift but older ones might (so they must be read). */
export function needsOlderOrders(recent: Pick<VaultProfile, "hasFreeGift">, more: boolean): boolean {
  return more && !recent.hasFreeGift;
}

async function readProfile(e: string, opts: ProfileOpts): Promise<VaultProfile> {
  const started = Date.now();
  const s = await getSettings([
    "vault.lookup_cache_minutes",
    "vault.profile_memory_seconds",
    "vault.recent_sessions",
    "vault.recent_orders",
    "vault.include_recommendation_children",
    "vault.mirror_expand_by_browser_session",
    "vault.imagen_public_image_base_url",
    "gift.unlock_rule",
    "gift.qualifying_product_ids",
    "links.order_session_url_template",
    "links.start_portrait_url",
  ] as const);
  const keepMs = s["vault.profile_memory_seconds"] * 1000;
  const live = opts.refresh || opts.memory === false;
  const sessionLimit = opts.all || opts.refresh ? 0 : s["vault.recent_sessions"];
  const orderLimit = opts.all || opts.refresh ? 0 : s["vault.recent_orders"];
  const scope: Scope = sessionLimit || orderLimit ? "recent" : "all";
  if (!live) {
    // Everything kept also answers a "newest first" request, cut down to the newest sessions.
    const everything = kept(e, "all", keepMs);
    if (everything) return scope === "all" ? everything : newestOf(everything, sessionLimit);
    const recent = scope === "recent" ? kept(e, "recent", keepMs) : null;
    if (recent) return recent;
  }

  const { shopify, mirror, imagen } = await getSources();
  const member = await getMember(e);

  const cacheFresh =
    !opts.refresh && member?.lookup_refreshed_at && Date.now() - new Date(member.lookup_refreshed_at).getTime() < s["vault.lookup_cache_minutes"] * 60_000;

  // A failing source degrades the profile instead of failing the page (SPEC: sources are live reads).
  const unavailable = new Set<VaultProfile["unavailable"][number]>();
  const soft = <T,>(name: VaultProfile["unavailable"][number], p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err: unknown) => {
      unavailable.add(name);
      console.error(`[profile] ${name} unavailable (${maskEmail(e)}): ${(err as Error).message}`);
      return fallback;
    });
  const includeChildren = s["vault.include_recommendation_children"];
  const imagenOpts = { includeChildren, imageBaseUrl: s["vault.imagen_public_image_base_url"], newestSessions: sessionLimit || undefined };
  const portraitsFor = (ids: string[]) => (ids.length ? soft("imagen", timed("imagen.portraits", () => imagen.portraits(ids, imagenOpts)), []) : Promise.resolve([]));
  const totalsFor = (ids: string[]) => (sessionLimit && ids.length ? soft("imagen", timed("imagen.portraitTotals", () => imagen.portraitTotals(ids, { includeChildren })), null) : Promise.resolve(null));
  const ordersRead = (): Promise<{ orders: ShopifyOrder[]; more: boolean }> =>
    orderLimit
      ? soft("shopify", timed("shopify.recentOrdersByEmail", () => shopify.recentOrdersByEmail(e, orderLimit)), { orders: [], more: false })
      : soft("shopify", timed("shopify.ordersByEmail", () => shopify.ordersByEmail(e)), []).then((orders) => ({ orders, more: false }));

  // Shopify and Imagen side by side: Imagen starts on the sessions we already know about (the mirror's,
  // or the cached list) while Shopify is still answering; any extra session found on an order line comes after.
  const sessionsP = cacheFresh
    ? Promise.resolve(member!.imagen_sessions.map((x) => ({ imagenSessionId: x.imagen_session_id, lptempSessionId: x.lptemp_session_id, firstSeenAt: "", lastSeenAt: "" })))
    : soft("mirror", timed("mirror.sessionsForEmail", () => mirror.sessionsForEmail([e], { expandByBrowserSession: s["vault.mirror_expand_by_browser_session"] })), []);
  const knownIds = sessionsP.then((list) => [...new Set(list.map((x) => x.imagenSessionId))]);
  const [ordersFirst, sessions, firstRows, totalsFirst] = await Promise.all([ordersRead(), sessionsP, knownIds.then(portraitsFor), knownIds.then(totalsFor)]);
  let { orders, more: moreOrders } = ordersFirst;
  let totals = totalsFirst;

  // Hi-res lines also carry an Imagen session id: another order → session link.
  const known = new Set(sessions.map((x) => x.imagenSessionId));
  const extra = new Set<string>();
  for (const o of orders) for (const l of o.lineItems) for (const a of l.customAttributes) if (a.key === "_imagegen_session_id" && /^[0-9a-f-]{36}$/.test(a.value) && !known.has(a.value)) extra.add(a.value);
  let rows = firstRows;
  if (extra.size && sessionLimit) {
    // The newest sessions may now include one only an order knows about: pick again across both.
    const all = [...known, ...extra];
    [rows, totals] = await Promise.all([portraitsFor(all), totalsFor(all)]);
  } else if (extra.size) {
    const seen = new Set(firstRows.map((r) => r.imageId));
    rows = [...firstRows, ...(await portraitsFor([...extra])).filter((r) => !seen.has(r.imageId))];
  }

  const build = () =>
    buildProfile({
      email: e,
      orders,
      mirrorSessions: sessions,
      rows,
      unlockRule: s["gift.unlock_rule"],
      qualifyingProductIds: s["gift.qualifying_product_ids"],
      orderUrlTemplate: s["links.order_session_url_template"],
      startPortraitUrl: s["links.start_portrait_url"],
    });
  let profile = build();
  // The free gift can sit on an older order: only then are the rest of the orders read.
  if (needsOlderOrders(profile, moreOrders)) {
    orders = await soft("shopify", timed("shopify.ordersByEmail", () => shopify.ordersByEmail(e)), orders);
    moreOrders = false;
    profile = build();
  }
  if (totals) {
    profile.sessionCount = Math.max(totals.sessions, profile.sessions.length);
    profile.portraitCount = Math.max(totals.portraits, profile.portraitCount);
    profile.orderedCount = Math.max(totals.ordered, profile.orderedCount);
  }
  profile.more = { sessions: Math.max(0, profile.sessionCount - profile.sessions.length), orders: moreOrders };

  profile.unavailable = [...unavailable];
  if (unavailable.size) {
    // Partial data: don't overwrite the member cache with it, and don't keep it.
    profile.memberId = member?.id ?? null;
    profile.lookupMs = Date.now() - started;
    return profile;
  }

  const patch: Partial<MemberRow> = {
    display_name: profile.displayName,
    shopify_customer_id: profile.shopifyCustomerId,
    portrait_count: profile.portraitCount,
  };
  // With only the newest orders read, "customer" is certain only when one of them is paid, and the
  // first order date isn't known: those stay as the last full read left them.
  if (!moreOrders) {
    patch.is_customer = profile.isCustomer;
    patch.first_order_at = profile.firstOrderAt;
  } else if (profile.isCustomer) patch.is_customer = true;
  if (!cacheFresh) {
    patch.imagen_sessions = sessions.map((x) => ({ imagen_session_id: x.imagenSessionId, lptemp_session_id: x.lptempSessionId }));
    patch.lookup_refreshed_at = new Date().toISOString();
  }
  const write = async () => {
    try {
      return await upsertMember(e, opts.createdVia ?? "sign_in", patch);
    } catch (err) {
      console.error(`[profile] member cache write failed (${maskEmail(e)}): ${(err as Error).message}`);
      return null;
    }
  };
  if (member) {
    // Known member: the page doesn't wait for the cache write.
    profile.memberId = member.id;
    await afterResponse(write);
  } else {
    profile.memberId = (await write())?.id ?? null;
  }
  profile.lookupMs = Date.now() - started;
  if (keepMs > 0) remember(e, scope, profile, started);
  return profile;
}

/**
 * Just the person's portraits, as fast as possible: from this server's kept profile, else from Imagen
 * for the sessions already cached on their member row, without asking Shopify. For finding one of their
 * own pictures (add to cart, Product ideas); callers fall back to getVaultProfile when the picture isn't
 * here. Never kept, and its "ordered" labels may miss orders that only Shopify knows about.
 */
export async function knownPortraits(email: string): Promise<VaultProfile["sessions"] | null> {
  const e = email.trim().toLowerCase();
  const [s, member] = await Promise.all([
    getSettings([
      "vault.profile_memory_seconds",
      "vault.include_recommendation_children",
      "vault.imagen_public_image_base_url",
      "gift.unlock_rule",
      "gift.qualifying_product_ids",
      "links.order_session_url_template",
      "links.start_portrait_url",
    ] as const),
    getMember(e).catch(() => null),
  ]);
  const hit = kept(e, "all", s["vault.profile_memory_seconds"] * 1000);
  if (hit) return hit.sessions;
  const ids = [...new Set((member?.imagen_sessions ?? []).map((x) => x.imagen_session_id))];
  if (!ids.length) return null;
  try {
    const { imagen } = await getSources();
    const rows = await timed("imagen.portraits", () => imagen.portraits(ids, { includeChildren: s["vault.include_recommendation_children"], imageBaseUrl: s["vault.imagen_public_image_base_url"] }));
    return buildProfile({
      email: e,
      orders: [],
      mirrorSessions: member!.imagen_sessions.map((x) => ({ imagenSessionId: x.imagen_session_id, lptempSessionId: x.lptemp_session_id, firstSeenAt: "", lastSeenAt: "" })),
      rows,
      unlockRule: s["gift.unlock_rule"],
      qualifyingProductIds: s["gift.qualifying_product_ids"],
      orderUrlTemplate: s["links.order_session_url_template"],
      startPortraitUrl: s["links.start_portrait_url"],
    }).sessions;
  } catch {
    return null;
  }
}
