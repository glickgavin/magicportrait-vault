/** Who may make a card right now (SPEC §8.3). Pure. */
export type CardRuleInput = {
  enabled: boolean;
  whoCanCreate: "customers_with_order" | "everyone_with_portrait";
  perCustomer: string; // "unlimited" | "N" per calendar month
  hasFreeGift: boolean;
  portraitCount: number;
  cardsThisMonth: number;
  now: Date;
};

export type CardAccess = { allowed: true } | { allowed: false; reason: "paused" | "locked" | "no_portraits" | "limit"; nextAvailableAt?: string };

export function cardAccess(i: CardRuleInput): CardAccess {
  if (!i.enabled) return { allowed: false, reason: "paused" };
  if (i.portraitCount === 0) return { allowed: false, reason: "no_portraits" };
  if (i.whoCanCreate === "customers_with_order" && !i.hasFreeGift) return { allowed: false, reason: "locked" };
  if (i.perCustomer !== "unlimited") {
    const max = Number(i.perCustomer);
    if (Number.isFinite(max) && i.cardsThisMonth >= max) {
      const next = new Date(Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth() + 1, 1));
      return { allowed: false, reason: "limit", nextAvailableAt: next.toISOString() };
    }
  }
  return { allowed: true };
}

export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
