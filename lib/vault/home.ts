import "server-only";
import { getVaultProfile, type VaultProfile } from "@/lib/vault/profile";
import { getSettings } from "@/lib/settings";
import { countCardsBySender, listCardsBySender, type CardRow } from "@/lib/db/cards";
import { getCatalog, pickFirstCardVersion, type CatalogVersion } from "@/lib/db/themes";
import { cardAccess, monthStart, type CardAccess } from "@/lib/cards/rules";
import { parseRedeemOrder, orderCounts } from "@/lib/redeem/order";
import { pickFirstCardPortrait, type Portrait } from "@/lib/vault/profile-core";

export type HomeData = {
  profile: VaultProfile;
  cards: CardRow[];
  cardsCount: number;
  access: CardAccess;
  cardsEnabled: boolean;
  mugPending: number;
  firstVersion: CatalogVersion | null;
  firstPortrait: Portrait | null;
  firstPetName: string | null;
  firstOrderOffer: string;
  firstOrderOfferCode: string;
  startPortraitUrl: string;
  mirrorSince: string;
};

/** Orders with the free mug and no photo chosen yet (light check; the order page applies the full lock rule). */
export function mugPendingCount(profile: VaultProfile): number {
  return profile.rawOrders.filter((o) => {
    if (!orderCounts(o)) return false;
    const p = parseRedeemOrder(o);
    const mugLine = o.lineItems.find((l) => l.id === p.mug.lineItemId);
    return p.mug.present && !p.mug.currentTileId && (mugLine?.unfulfilledQuantity ?? 1) > 0;
  }).length;
}

export async function loadHome(email: string, opts: { all?: boolean } = {}): Promise<HomeData> {
  const now = new Date();
  const s = await getSettings([
    "cards.enabled",
    "cards.who_can_create",
    "cards.per_customer",
    "cards.first_card_default_version",
    "themes.in_season_days_before",
    "vault.first_order_offer",
    "vault.first_order_offer_code",
    "links.start_portrait_url",
    "vault.mirror_session_since",
  ] as const);
  const [profile, cards, cardsThisMonth, catalog] = await Promise.all([
    getVaultProfile(email, opts.all ? { all: true } : undefined),
    listCardsBySender(email, 50),
    countCardsBySender(email, monthStart(now)),
    getCatalog(now, s["themes.in_season_days_before"]),
  ]);
  const access = cardAccess({
    enabled: s["cards.enabled"],
    whoCanCreate: s["cards.who_can_create"],
    perCustomer: s["cards.per_customer"],
    hasFreeGift: profile.hasFreeGift,
    portraitCount: profile.portraitCount,
    cardsThisMonth,
    now,
  });
  const pick = pickFirstCardPortrait(profile);
  return {
    profile,
    cards: cards.filter((c) => c.status !== "failed"),
    cardsCount: cards.filter((c) => c.status !== "failed").length,
    access,
    cardsEnabled: s["cards.enabled"],
    mugPending: mugPendingCount(profile),
    firstVersion: pickFirstCardVersion(catalog, s["cards.first_card_default_version"]),
    firstPortrait: pick?.portrait ?? null,
    firstPetName: pick?.session.petName ?? null,
    firstOrderOffer: s["vault.first_order_offer"],
    firstOrderOfferCode: s["vault.first_order_offer_code"],
    startPortraitUrl: s["links.start_portrait_url"],
    mirrorSince: s["vault.mirror_session_since"],
  };
}
