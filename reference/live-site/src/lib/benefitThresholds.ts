/**
 * Tile-count thresholds for the free benefits.
 *
 * ⚠️ FREE_SHIPPING is a DISPLAY PROXY, not the rule. Real free shipping is a
 * $79 subtotal — see src/lib/shipping.ts. Five 8x8s at $17.99 is $89.95 and
 * four is $71.96, so 5 is the unlock point for the common case only. Never
 * gate anything on it; use shipping.isFree.
 *
 * MUG is a real rule: mugEligible === totalTileCount >= MUG.
 */
export const BENEFIT_TILE_THRESHOLDS = {
  MUG: 4,
  /**
   * ⚠️ DISPLAY PROXY ONLY — the real rule is a $79 subtotal (src/lib/shipping.ts).
   *
   * This value MUST track the 8×8 price. At $17.99 (post-discount) five tiles
   * is $89.95 and four is $71.96, so 5 is the unlock point. It was 6 when the
   * 8×8 was $14.98.
   *
   * ⚠️ RE-CHECK THIS WHENEVER THE 8×8 PRICE CHANGES, or the copy will
   * misstate what the customer needs.
   */
  FREE_SHIPPING: 5,
  /**
   * Free hi-res downloads.
   *
   * ⚠️ TEMPORARILY 1 — this reproduces the original rule ("unlocked whenever a
   * portrait is present") so the first publish of the spares work is invisible
   * to customers.
   *
   * THE INTENDED VALUE IS 7: one above the default basket of 6, so the customer
   * lands one tile short and the two spares in the Add-more sheet are a single
   * tap from unlocking it. That is the whole point of the mechanic.
   *
   * SET THIS TO 7 once imagegen returns 8 renditions per theme. Until then a
   * 7 would take downloads away with no way to earn them back. Nothing else
   * needs changing — every consumer reads this value.
   */
  DOWNLOADS: 1,
} as const;

/** Renditions seeded into the basket. Anything beyond this becomes a spare.
 *  Only applies when MORE than this many are returned — a session returning 4
 *  or 6 seeds all of them and has no spares. */
export const BASKET_SEED_LIMIT = 6;
