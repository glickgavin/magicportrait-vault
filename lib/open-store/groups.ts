import type { StoreCollection } from "./sources/types";

/**
 * Settings › Shop › Products groups (docs/open-store.md › Settings): one group per Shopify collection whose handle
 * starts with `open_store.admin_group_prefix` ("magic"), leaving out the Magic Store collection itself (every store
 * product is in it) and empty ones. A product in two such collections shows in both; products in none are
 * "Not in a group". Pure, so a test can pin it.
 */
export type ProductGroup = {
  handle: string;
  title: string;
  image: string | null;
  productIds: string[];
  hidden: number;
  warnings: number;
};

export const UNGROUPED = "ungrouped";

type RowLike = { product: { id: string; media: { url: string }[] }; hidden: boolean; warnings: number };

export function productGroups(rows: RowLike[], collections: StoreCollection[], storeHandle: string): { groups: ProductGroup[]; ungrouped: ProductGroup | null } {
  const byId = new Map(rows.map((r) => [r.product.id, r]));
  const placed = new Set<string>();
  const sum = (ids: string[]) => ({
    hidden: ids.filter((id) => byId.get(id)?.hidden).length,
    warnings: ids.reduce((n, id) => n + (byId.get(id)?.warnings ?? 0), 0),
  });
  const groups: ProductGroup[] = [];
  for (const c of collections) {
    if (c.handle === storeHandle) continue;
    // Only products the settings list knows (in the Store or Magic Store collection), in the collection's order.
    const ids = c.productIds.filter((id) => byId.has(id));
    if (!ids.length) continue;
    ids.forEach((id) => placed.add(id));
    groups.push({ handle: c.handle, title: c.title, image: c.image?.url ?? byId.get(ids[0])?.product.media[0]?.url ?? null, productIds: ids, ...sum(ids) });
  }
  const rest = rows.map((r) => r.product.id).filter((id) => !placed.has(id));
  const ungrouped = rest.length ? { handle: UNGROUPED, title: "Not in a group", image: null, productIds: rest, ...sum(rest) } : null;
  return { groups, ungrouped };
}

/** "Magic Store · Wall art" reads as "Wall art" on its card: the shared part before " · " is dropped. */
export function groupLabel(title: string): string {
  const i = title.indexOf(" · ");
  return i > 0 ? title.slice(i + 3) : title;
}
