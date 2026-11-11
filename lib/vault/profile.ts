import "server-only";
import { cache } from "react";
import { getSources } from "@/lib/sources";
import { getSettings } from "@/lib/settings";
import { getMember, upsertMember, type MemberRow } from "@/lib/db/members";
import { buildProfile, type VaultProfile } from "./profile-core";
import { maskEmail } from "@/lib/utils";
import { afterResponse, timed } from "@/lib/perf";

export type { VaultProfile } from "./profile-core";

/** What each server keeps between pages: email → profile and when it was read. Memory only, never stored. */
const memory = new Map<string, { at: number; profile: VaultProfile }>();
const MEMORY_MAX = 500;
/** Reads still running, so requests arriving together for one person share them. */
const reading = new Map<string, Promise<VaultProfile>>();

/** When each person's kept profile was last dropped: a read that started before then isn't kept. */
const forgotAt = new Map<string, number>();

function remember(email: string, profile: VaultProfile, startedAt: number) {
  if ((forgotAt.get(email) ?? 0) >= startedAt) return;
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value!);
  memory.set(email, { at: Date.now(), profile });
}

/** Drop what this server keeps for a person, after we change something their pages show (a mug choice). */
export function forgetProfile(email: string) {
  const e = email.trim().toLowerCase();
  memory.delete(e);
  reading.delete(e);
  if (forgotAt.size >= MEMORY_MAX) forgotAt.clear();
  forgotAt.set(e, Date.now());
}

type ProfileOpts = { refresh?: boolean; createdVia?: MemberRow["created_via"]; memory?: boolean };

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
  const running = reading.get(e);
  if (running) return running;
  const p = readProfile(e, opts).finally(() => reading.delete(e));
  reading.set(e, p);
  return p;
});

async function readProfile(e: string, opts: ProfileOpts): Promise<VaultProfile> {
  const started = Date.now();
  const s = await getSettings([
    "vault.lookup_cache_minutes",
    "vault.profile_memory_seconds",
    "vault.include_recommendation_children",
    "vault.mirror_expand_by_browser_session",
    "vault.imagen_public_image_base_url",
    "gift.unlock_rule",
    "gift.qualifying_product_ids",
    "links.order_session_url_template",
    "links.start_portrait_url",
  ] as const);
  const keepMs = s["vault.profile_memory_seconds"] * 1000;
  if (!opts.refresh && opts.memory !== false && keepMs > 0) {
    const kept = memory.get(e);
    if (kept && Date.now() - kept.at < keepMs) return kept.profile;
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
  const imagenOpts = { includeChildren: s["vault.include_recommendation_children"], imageBaseUrl: s["vault.imagen_public_image_base_url"] };
  const portraitsFor = (ids: string[]) => (ids.length ? soft("imagen", timed("imagen.portraits", () => imagen.portraits(ids, imagenOpts)), []) : Promise.resolve([]));

  // Shopify and Imagen side by side: Imagen starts on the sessions we already know about (the mirror's,
  // or the cached list) while Shopify is still answering; any extra session found on an order line comes after.
  const sessionsP = cacheFresh
    ? Promise.resolve(member!.imagen_sessions.map((x) => ({ imagenSessionId: x.imagen_session_id, lptempSessionId: x.lptemp_session_id, firstSeenAt: "", lastSeenAt: "" })))
    : soft("mirror", timed("mirror.sessionsForEmail", () => mirror.sessionsForEmail([e], { expandByBrowserSession: s["vault.mirror_expand_by_browser_session"] })), []);
  const [orders, sessions, firstRows] = await Promise.all([
    soft("shopify", timed("shopify.ordersByEmail", () => shopify.ordersByEmail(e)), []),
    sessionsP,
    sessionsP.then((list) => portraitsFor([...new Set(list.map((x) => x.imagenSessionId))])),
  ]);

  // Hi-res lines also carry an Imagen session id: another order → session link.
  const known = new Set(sessions.map((x) => x.imagenSessionId));
  const extra = new Set<string>();
  for (const o of orders) for (const l of o.lineItems) for (const a of l.customAttributes) if (a.key === "_imagegen_session_id" && /^[0-9a-f-]{36}$/.test(a.value) && !known.has(a.value)) extra.add(a.value);
  const seen = new Set(firstRows.map((r) => r.imageId));
  const rows = [...firstRows, ...(await portraitsFor([...extra])).filter((r) => !seen.has(r.imageId))];

  const profile = buildProfile({
    email: e,
    orders,
    mirrorSessions: sessions,
    rows,
    unlockRule: s["gift.unlock_rule"],
    qualifyingProductIds: s["gift.qualifying_product_ids"],
    orderUrlTemplate: s["links.order_session_url_template"],
    startPortraitUrl: s["links.start_portrait_url"],
  });

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
    is_customer: profile.isCustomer,
    first_order_at: profile.firstOrderAt,
    portrait_count: profile.portraitCount,
  };
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
  if (keepMs > 0) remember(e, profile, started);
  return profile;
}
