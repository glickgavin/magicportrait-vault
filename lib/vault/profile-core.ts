import type { ImagenPortraitRow, MirrorSession, ShopifyOrder } from "@/lib/sources/types";
import { attrMap, isPaidOrder, lineTileId, orderCounts, orderUnlocksGift } from "@/lib/redeem/order";
import { firstName as firstNameOf, initialsFor } from "@/lib/utils";

export type Portrait = {
  imageId: string;
  sessionId: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  tileIndex: number | null;
  ordered: boolean;
  orderNames: string[];
};

export type SessionGroup = {
  sessionId: string;
  lptempSessionId: string | null;
  themeName: string | null;
  themeSlug: string | null;
  petName: string | null;
  createdAt: string;
  isRecommendationChild: boolean;
  parentSessionId: string | null;
  ordered: boolean;
  orderNames: string[];
  orderUrl: string;
  portraits: Portrait[];
};

export type OrderSummary = {
  id: string;
  legacyId: string;
  name: string;
  createdAt: string;
  cancelled: boolean;
  counts: boolean;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
};

export type VaultProfile = {
  email: string;
  memberId: string | null;
  displayName: string | null;
  firstName: string | null;
  initials: string;
  shopifyCustomerId: string | null;
  isCustomer: boolean;
  hasFreeGift: boolean;
  firstOrderAt: string | null;
  orders: OrderSummary[];
  rawOrders: ShopifyOrder[];
  sessions: SessionGroup[];
  /** All of the person's sessions, portraits and ordered portraits, also when only the newest are in `sessions`. */
  sessionCount: number;
  portraitCount: number;
  orderedCount: number;
  /** What isn't loaded: sessions not in `sessions`, and whether older orders weren't read. */
  more: { sessions: number; orders: boolean };
  state: "customer" | "creator" | "nobody";
  lookupMs: number;
  /** Sources that failed during this lookup; the profile is partial when non-empty. */
  unavailable: ("shopify" | "mirror" | "imagen")[];
};

export type BuildInput = {
  email: string;
  orders: ShopifyOrder[];
  mirrorSessions: MirrorSession[];
  rows: ImagenPortraitRow[];
  unlockRule: "any_paid_order" | "qualifying_products";
  qualifyingProductIds: string[];
  orderUrlTemplate: string;
  startPortraitUrl: string;
};

export function buildProfile(input: BuildInput): VaultProfile {
  const { email, orders } = input;
  const byLegacy = new Map(orders.map((o) => [o.legacyId, o]));

  // Image ids that appear as portrait lines in this email's counted orders → order names.
  const lineOrders = new Map<string, Set<string>>();
  for (const o of orders) {
    if (!orderCounts(o)) continue;
    for (const l of o.lineItems) {
      const t = lineTileId(attrMap(l.customAttributes));
      if (t) (lineOrders.get(t) ?? lineOrders.set(t, new Set()).get(t)!).add(o.name);
    }
  }

  const lptempBySession = new Map(input.mirrorSessions.map((s) => [s.imagenSessionId, s.lptempSessionId]));
  const groups = new Map<string, SessionGroup>();

  for (const r of input.rows) {
    // §3.6: ordered = (revenue_events OR line in their orders) AND NOT every matching order is cancelled/refunded.
    const names = new Set<string>(lineOrders.get(r.imageId) ?? []);
    let revenueCounts = false;
    for (const legacy of r.shopifyOrderIds) {
      const o = byLegacy.get(legacy);
      if (!o) revenueCounts = true; // placed on another email: counts
      else if (orderCounts(o)) {
        revenueCounts = true;
        names.add(o.name);
      }
    }
    const ordered = revenueCounts || names.size > 0;
    const p: Portrait = {
      imageId: r.imageId,
      sessionId: r.sessionId,
      imageUrl: r.imageUrl,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt,
      tileIndex: r.tileIndex,
      ordered,
      orderNames: [...names],
    };
    let g = groups.get(r.sessionId);
    if (!g) {
      const lptemp = lptempBySession.get(r.sessionId) ?? (r.parentSessionId ? lptempBySession.get(r.parentSessionId) : null) ?? null;
      g = {
        sessionId: r.sessionId,
        lptempSessionId: lptemp,
        themeName: r.themeName,
        themeSlug: r.themeSlug,
        petName: r.petName,
        createdAt: r.sessionCreatedAt,
        isRecommendationChild: r.isRecommendationChild,
        parentSessionId: r.parentSessionId,
        ordered: false,
        orderNames: [],
        orderUrl: lptemp ? input.orderUrlTemplate.replace("{lptemp_session_id}", encodeURIComponent(lptemp)) : input.startPortraitUrl,
        portraits: [],
      };
      groups.set(r.sessionId, g);
    }
    g.portraits.push(p);
  }

  const sessions = [...groups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const g of sessions) {
    g.portraits.sort((a, b) => (a.tileIndex ?? -1) - (b.tileIndex ?? -1));
    g.ordered = g.portraits.some((p) => p.ordered);
    g.orderNames = [...new Set(g.portraits.flatMap((p) => p.orderNames))];
  }

  const paid = orders.filter(isPaidOrder);
  const isCustomer = paid.length > 0;
  const named = orders.find((o) => o.customer?.firstName || o.customer?.lastName)?.customer ?? null;
  const displayName = named ? [named.firstName, named.lastName].filter(Boolean).join(" ") || null : null;
  const portraitCount = sessions.reduce((n, g) => n + g.portraits.length, 0);
  const orderedCount = sessions.reduce((n, g) => n + g.portraits.filter((p) => p.ordered).length, 0);
  const firstOrderAt = paid.length ? paid.map((o) => o.createdAt).sort()[0] : null;

  return {
    email,
    memberId: null,
    displayName,
    firstName: firstNameOf(displayName),
    initials: initialsFor(displayName, email),
    shopifyCustomerId: named ? (orders.find((o) => o.customer)?.customer?.id ?? null) : null,
    isCustomer,
    hasFreeGift: orders.some((o) => orderUnlocksGift(o, input.unlockRule, input.qualifyingProductIds)),
    firstOrderAt,
    orders: orders.map((o) => ({
      id: o.id,
      legacyId: o.legacyId,
      name: o.name,
      createdAt: o.createdAt,
      cancelled: Boolean(o.cancelledAt),
      counts: orderCounts(o),
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
    })),
    rawOrders: orders,
    sessions,
    sessionCount: sessions.length,
    portraitCount,
    orderedCount,
    more: { sessions: 0, orders: false },
    state: isCustomer ? "customer" : portraitCount > 0 ? "creator" : "nobody",
    lookupMs: 0,
    unavailable: [],
  };
}

/** The newest ordered portrait, else the newest portrait (SPEC §8.0). */
export function pickFirstCardPortrait(p: Pick<VaultProfile, "sessions">): { portrait: Portrait; session: SessionGroup } | null {
  const all = p.sessions.flatMap((s) => s.portraits.map((portrait) => ({ portrait, session: s })));
  if (!all.length) return null;
  const sorted = all.sort((a, b) => b.portrait.createdAt.localeCompare(a.portrait.createdAt));
  return sorted.find((x) => x.portrait.ordered) ?? sorted[0];
}
