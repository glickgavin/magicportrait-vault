/** Who can see the shop (docs/shop.md › Keeping today's app unchanged). Pure, so it's easy to test. */
export type ShopFlags = { enabled: boolean; superUserPreview: boolean };

export function canSeeShop(flags: ShopFlags, user: { isSuperUser: boolean } | null): boolean {
  if (flags.enabled) return true;
  return Boolean(flags.superUserPreview && user?.isSuperUser);
}
