import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { productRows, type ProductRow } from "@/lib/open-store/admin";
import { STORE_HIDDEN_TEXT } from "@/lib/open-store/catalog";
import { shopOverview } from "@/lib/shop/admin";
import { HIDDEN_REASON_TEXT } from "@/lib/shop/catalog";
import { CreateFieldsButton } from "@/components/admin/shop/ShopEditors";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

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
export default async function ShopProducts({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireSuperUser();
  const sp = await searchParams;
  const filter: Filter = FILTERS.some(([k]) => k === sp.filter) ? (sp.filter as Filter) : "all";
  const [list, overview] = await Promise.all([productRows(), shopOverview()]);

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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="shop-products" className="text-[19px] font-extrabold">
                Products
              </h2>
              <span className="text-[14px] text-ink-2">
                {list.rows.filter((r) => r.shop).length} in Gifts &amp; Products · {list.rows.filter((r) => r.store).length} in the Magic Store
                {overview.ok && overview.sourceKind === "fixtures" ? " · fixtures" : ""}
                {list.themes === null ? " · Imagen's themes couldn't be read" : ""}
              </span>
            </div>
            <nav aria-label="Filter products" className="mt-3 flex flex-wrap gap-2">
              {FILTERS.map(([k, label]) => {
                const n = list.rows.filter((r) => matches(r, k)).length;
                const on = k === filter;
                return (
                  <Link
                    key={k}
                    href={k === "all" ? "/settings/shop" : `/settings/shop?filter=${k}`}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-9 items-center rounded-full px-3.5 text-[14px]", on ? "border-2 border-[#DD07C4] bg-pink-tint font-bold text-pink-dark" : "border border-line bg-white font-semibold")}
                  >
                    {label} · {n}
                  </Link>
                );
              })}
            </nav>
            <ul className="mt-4 flex flex-col gap-3">
              {list.rows
                .filter((r) => matches(r, filter))
                .map((r) => (
                  <ProductItem key={r.product.id} row={r} />
                ))}
              {!list.rows.filter((r) => matches(r, filter)).length && <li className="text-[15px] text-ink-2">No products here.</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function ProductItem({ row }: { row: ProductRow }) {
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
