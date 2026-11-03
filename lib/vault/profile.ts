import "server-only";
import { cache } from "react";
import { getSources } from "@/lib/sources";
import { getSettings } from "@/lib/settings";
import { getMember, upsertMember, type MemberRow } from "@/lib/db/members";
import { buildProfile, type VaultProfile } from "./profile-core";
import { maskEmail } from "@/lib/utils";

export type { VaultProfile } from "./profile-core";

/**
 * Everything we know about one person, read live: Shopify orders, Imagen portraits (via the
 * mirror's session ids, cached in vault_members for `vault.lookup_cache_minutes`) and the ordered flag.
 * Memoised per request.
 */
export const getVaultProfile = cache(async (email: string, opts: { refresh?: boolean; createdVia?: MemberRow["created_via"] } = {}): Promise<VaultProfile> => {
  const started = Date.now();
  const e = email.trim().toLowerCase();
  const s = await getSettings([
    "vault.lookup_cache_minutes",
    "vault.include_recommendation_children",
    "vault.mirror_expand_by_browser_session",
    "vault.imagen_public_image_base_url",
    "gift.unlock_rule",
    "gift.qualifying_product_ids",
    "links.order_session_url_template",
    "links.start_portrait_url",
  ] as const);
  const { shopify, mirror, imagen } = await getSources();
  const member = await getMember(e);

  const cacheFresh =
    !opts.refresh && member?.lookup_refreshed_at && Date.now() - new Date(member.lookup_refreshed_at).getTime() < s["vault.lookup_cache_minutes"] * 60_000;

  const [orders, sessions] = await Promise.all([
    shopify.ordersByEmail(e),
    cacheFresh
      ? Promise.resolve(member!.imagen_sessions.map((x) => ({ imagenSessionId: x.imagen_session_id, lptempSessionId: x.lptemp_session_id, firstSeenAt: "", lastSeenAt: "" })))
      : mirror.sessionsForEmail([e], { expandByBrowserSession: s["vault.mirror_expand_by_browser_session"] }),
  ]);

  // Hi-res lines also carry an Imagen session id: another order → session link.
  const sessionIds = new Set(sessions.map((x) => x.imagenSessionId));
  for (const o of orders) for (const l of o.lineItems) for (const a of l.customAttributes) if (a.key === "_imagegen_session_id" && /^[0-9a-f-]{36}$/.test(a.value)) sessionIds.add(a.value);

  const rows = await imagen.portraits([...sessionIds], { includeChildren: s["vault.include_recommendation_children"], imageBaseUrl: s["vault.imagen_public_image_base_url"] });

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

  try {
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
    const m = await upsertMember(e, opts.createdVia ?? "sign_in", patch);
    profile.memberId = m.id;
  } catch (err) {
    console.error(`[profile] member cache write failed (${maskEmail(e)}): ${(err as Error).message}`);
  }
  profile.lookupMs = Date.now() - started;
  return profile;
});
