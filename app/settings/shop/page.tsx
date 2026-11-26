import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { productRows, type ProductRow } from "@/lib/open-store/admin";
import { syncSummaries } from "@/lib/dreamship/link";
import { STORE_HIDDEN_TEXT } from "@/lib/open-store/catalog";
import { shopOverview } from "@/lib/shop/admin";
import { HIDDEN_REASON_TEXT } from "@/lib/shop/catalog";
import { CreateFieldsButton } from "@/components/admin/shop/ShopEditors";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { getOpenStoreSource } from "@/lib/open-store/sources";
import { groupLabel, productGroups, UNGROUPED, type ProductGroup } from "@/lib/open-store/groups";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: products" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";
const FILTERS = [
  ["all", "All"],
  ["shop", "Gifts & Products"],
  ["magic", "Magic Store"],
  ["hidden", "Hidden"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const hiddenAnywhere = (r: ProductRow) => Boolean((r.shop && r.shop.hidden.length) || (r.store && r.store.hidden.length));
const matches = (r: ProductRow, f: Filter) => (f === "shop" ? Boolean(r.shop) : f === "magic" ? Boolean(r.store) : f === "hidden" ? hiddenAnywhere(r) : true);

/** Settings › Shop › Products: every product in the Store or Magic Store collection, each once (docs/open-store.md › Settings). */
export default async function ShopProducts({ searchParams }: { searchParams: Promise<{ filter?: string; group?: string }> }) {
  await requireSuperUser();
  const sp = await searchParams;
  const filter: Filter = FILTERS.some(([k]) => k === sp.filter) ? (sp.filter as Filter) : "all";
  const s = await getSettings(["open_store.admin_group_prefix", "open_store.collection"] as const);
  const [list, overview, dreamship, collections] = await Promise.all([
    productRows(),
    shopOverview(),
    syncSummaries().catch(() => new Map() as Awaited<ReturnType<typeof syncSummaries>>),
    getOpenStoreSource()
      .then((src) => src.collectionsByPrefix(s["open_store.admin_group_prefix"]))
      .catch(() => null),
  ]);
  // Groups (one per "magic…" collection) come first; a group, "all", or a filter opens the product list.
  const grouping =
    list.ok && collections
      ? productGroups(
          list.rows.map((r) => ({ product: r.product, hidden: hiddenAnywhere(r), warnings: dreamship.get(r.product.id)?.warnings ?? 0 })),
          collections,
          s["open_store.collection"],
        )
      : null;
  const allGroups = grouping ? [...grouping.groups, ...(grouping.ungrouped ? [grouping.ungrouped] : [])] : [];
  const group = sp.group && sp.group !== "all" ? (allGroups.find((g) => g.handle === sp.group) ?? null) : null;
  const showGroups = Boolean(grouping) && !sp.group && !sp.filter;
  const inView = (r: ProductRow) => (group ? group.productIds.includes(r.product.id) : true) && matches(r, filter);
  const base = group ? `/settings/shop?group=${encodeURIComponent(group.handle)}` : "/settings/shop?group=all";
  const withFilter = (k: Filter) => (k === "all" ? base : `${base}&filter=${k}`);
  const ordered = group ? group.productIds.map((id) => list.ok && list.rows.find((r) => r.product.id === id)).filter((r): r is ProductRow => Boolean(r)) : list.ok ? list.rows : [];

  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Shop: products</h1>
      <p className="max-w-[860px] text-[15px] text-ink-2">
        Every product in the Store collection (the signed-in Gifts and Products pages) or the Magic Store collection (<code>/store</code>), each once. Open a product to set its fields for both stores on one page. A product joins or leaves a store by being added to or removed from its collection in Shopify.
      </p>

      {overview.ok && overview.missingDefinitions.length > 0 && (
        <section className={cn(CARD, "mt-5")} aria-labelledby="shop-fields">
          <h2 id="shop-fields" className="text-[19px] font-extrabold">
            Shop fields in Shopify
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {overview.missingDefinitions.length} of the <code>mmp_shop</code> fields aren&apos;t set up in Shopify yet: {overview.missingDefinitions.join(", ")}. Creating them adds new fields only; nothing on the main site uses them.
          </p>
          <div className="mt-3">
            <CreateFieldsButton missing={overview.missingDefinitions.length} />
          </div>
        </section>
      )}

      <section className={cn(CARD, "mt-5")} aria-labelledby="shop-products">
        {!list.ok ? (
          <>
            <h2 id="shop-products" className="text-[19px] font-extrabold">
              Products
            </h2>
            <p role="alert" className="mt-2 text-[15px] text-[#a1251b]">
              {list.error}
            </p>
          </>
        ) : (
          <>
            {showGroups ? (
              <GroupGrid groups={allGroups} total={list.rows.length} />
            ) : (
            <>
            {grouping && (
              <nav aria-label="Breadcrumb" className="mb-2 text-[14px]">
                <Link href="/settings/shop" className="link">
                  ← All groups
                </Link>
              </nav>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shop-products" className="text-[19px] font-extrabold">
                {group ? groupLabel(group.title) : "All products"}
              </h2>
              <span className="text-[14px] text-ink-2">
                {list.rows.filter((r) => r.shop).length} in Gifts &amp; Products · {list.rows.filter((r) => r.store).length} in the Magic Store
                {overview.ok && overview.sourceKind === "fixtures" ? " · fixtures" : ""}
                {list.themes === null ? " · Imagen's themes couldn't be read" : ""}
              </span>
            </div>
            <nav aria-label="Filter products" className="mt-3 flex flex-wrap gap-2">
              {FILTERS.map(([k, label]) => {
                const n = ordered.filter((r) => matches(r, k)).length;
                const on = k === filter;
                return (
                  <Link
                    key={k}
                    href={withFilter(k)}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-9 items-center rounded-full px-3.5 text-[14px]", on ? "border-2 border-[#DD07C4] bg-pink-tint font-bold text-pink-dark" : "border border-line bg-white font-semibold")}
                  >
                    {label} · {n}
                  </Link>
                );
              })}
            </nav>
            <ul className="mt-4 flex flex-col gap-3">
              {ordered.filter(inView).map((r) => (
                <ProductItem key={r.product.id} row={r} dreamship={dreamship.get(r.product.id) ?? null} />
              ))}
              {!ordered.filter(inView).length && <li className="text-[15px] text-ink-2">No products here.</li>}
            </ul>
            </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** The groups as cards: each opens its products. "All products" keeps the full list one click away. */
function GroupGrid({ groups, total }: { groups: ProductGroup[]; total: number }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="shop-products" className="text-[19px] font-extrabold">
          Product groups
        </h2>
        <Link href="/settings/shop?group=all" className="link text-[14px] font-bold">
          All products · {total} →
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">One group per Shopify collection whose handle starts with the prefix set on Settings › Magic Store. A product in two collections shows in both.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="shop-groups">
        {groups.map((g) => (
          <li key={g.handle}>
            <Link href={`/settings/shop?group=${encodeURIComponent(g.handle)}`} className="flex h-full items-center gap-3 rounded-[16px] border border-line p-3 hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DD07C4]" data-testid="shop-group">
              {g.image ? <img src={g.image} alt="" className="h-16 w-16 flex-none rounded-[12px] object-cover" /> : <span className="h-16 w-16 flex-none rounded-[12px] bg-black/[0.05]" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">{g.handle === UNGROUPED ? g.title : groupLabel(g.title)}</span>
                <span className="mt-0.5 block text-[13px] text-ink-2">
                  {g.productIds.length} {g.productIds.length === 1 ? "product" : "products"}
                </span>
                {(g.hidden > 0 || g.warnings > 0) && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {g.hidden > 0 && <Badge tone="amber">{`${g.hidden} HIDDEN`}</Badge>}
                    {g.warnings > 0 && <Badge tone="amber">{`${g.warnings} ${g.warnings === 1 ? "WARNING" : "WARNINGS"}`}</Badge>}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className="text-[18px] text-ink-2">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

type DreamshipSummary = Awaited<ReturnType<typeof syncSummaries>> extends Map<string, infer V> ? V : never;

function ProductItem({ row, dreamship }: { row: ProductRow; dreamship: DreamshipSummary | null }) {
  const p = row.product;
  const thumb = p.media[0]?.url;
  const href = `/settings/shop/products/${p.legacyId}`;
  return (
    <li className="rounded-[16px] border border-line p-4" data-testid="shop-product">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[240px] flex-1 gap-3">
          {thumb ? <img src={thumb} alt="" className="h-14 w-14 flex-none rounded-[10px] object-cover" /> : <span className="h-14 w-14 flex-none rounded-[10px] bg-black/[0.05]" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="text-[16px] font-bold">
              <Link href={href} className="hover:underline">
                {p.title}
              </Link>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {row.shop && <Badge tone={row.shop.hidden.length ? "amber" : "green"}>{`GIFTS & PRODUCTS: ${row.shop.hidden.length ? "HIDDEN" : "SHOWN"}`}</Badge>}
              {row.store && <Badge tone={row.store.hidden.length ? "amber" : "green"}>{`MAGIC STORE: ${row.store.hidden.length ? "HIDDEN" : row.store.relatedOnly ? "RELATED ONLY" : "SHOWN"}`}</Badge>}
            </div>
            {dreamship && (dreamship.warnings > 0 || dreamship.differs > 0) && (
              <div className="mt-2 text-[13px]" data-testid="dreamship-warnings">
                <Link href={`${href}?tab=print#dreamship`} className="font-bold text-[#7a4b00] hover:underline">
                  Dreamship: {dreamship.warnings} {dreamship.warnings === 1 ? "warning" : "warnings"}
                  {dreamship.differs ? ` · ${dreamship.differs} ${dreamship.differs === 1 ? "field differs" : "fields differ"}` : ""}
                </Link>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {dreamship.flags.slice(0, 3).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {((row.shop?.hidden.length ?? 0) > 0 || (row.store?.hidden.length ?? 0) > 0) && (
              <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">
                {row.shop?.hidden.map((h) => (
                  <li key={`s-${h}`}>Gifts &amp; Products: {HIDDEN_REASON_TEXT[h]}</li>
                ))}
                {row.store?.hidden.map((h) => (
                  <li key={`m-${h}`}>Magic Store: {STORE_HIDDEN_TEXT[h]}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:w-[360px]">
          <dt className="text-ink-2">Page and occasions</dt>
          <dd>{row.shop ? [row.shop.page ? (row.shop.page === "all" ? "Gifts + Products" : row.shop.page === "gifts" ? "Gifts" : "Products") : "No page", ...p.occasions].join(" · ") : "Not in Gifts & Products"}</dd>
          <dt className="text-ink-2">Magic Store theme</dt>
          <dd>{row.store ? (row.store.theme ?? (row.store.relatedOnly ? "Related only" : "None")) : "Not in the Magic Store"}</dd>
          <dd className="col-span-2 mt-1">
            <Link href={href} className="link font-bold">
              Open {p.title} →
            </Link>
          </dd>
        </dl>
      </div>
    </li>
  );
}
