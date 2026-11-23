import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { productRow } from "@/lib/open-store/admin";
import { STORE_HIDDEN_TEXT } from "@/lib/open-store/catalog";
import { getSettings } from "@/lib/settings";
import { productFieldDefaults } from "@/lib/settings/product";
import { parseGeneration, productFieldProblems, readVariantField } from "@/lib/settings/product-fields";
import type { PhotoSlotWords } from "@/lib/settings/registry";
import { rulesFor, shopOverview } from "@/lib/shop/admin";
import { HIDDEN_REASON_TEXT } from "@/lib/shop/catalog";
import { parseVariantRules } from "@/lib/shop/rules";
import { ShopRulesEditor } from "@/components/admin/shop/ShopRulesEditor";
import { ProductFieldsEditor } from "@/components/admin/shop/ShopEditors";
import { ShortDescriptionEditor, StoreFieldsEditor, type StoreFieldsValues } from "@/components/admin/shop/StoreFieldsEditor";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: product" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";

/** Settings › Shop › one product: every field of a product, for both stores, on one page (docs/open-store.md › Settings). */
export default async function ShopProductPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireSuperUser();
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) notFound();
  const [found, overview, defaults, s] = await Promise.all([
    productRow(productId),
    shopOverview(),
    productFieldDefaults(),
    getSettings(["shop.default_min_short_side_px", "shop.default_max_crop_pct", "shop.collection_id", "open_store.collection"] as const),
  ]);
  if (!found.ok) {
    return (
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Product</h1>
        <p role="alert" className="mt-2 text-[15px] text-[#a1251b]">
          {found.error}
        </p>
      </div>
    );
  }
  const row = found.row;
  if (!row) notFound();
  const p = row.product;
  const domain = env.optional("SHOPIFY_STORE_DOMAIN");
  const admin = (path: string) => (domain ? `https://${domain}/admin/${path}` : null);
  const ruleDefaults = { minShortSidePx: s["shop.default_min_short_side_px"], maxCropPct: s["shop.default_max_crop_pct"] };
  const sizes = p.variants.map((v) => {
    const r = parseVariantRules(v.metafields, ruleDefaults);
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      availableForSale: v.availableForSale,
      rules: rulesFor(v.metafields),
      status: r.ok ? "ready" : [r.missing.length ? `missing ${r.missing.join(", ")}` : "", r.invalid.length ? `invalid ${r.invalid.join(", ")}` : ""].filter(Boolean).join("; "),
    };
  });

  // The Magic Store fields as stored (empty = the store default, shown in grey by the editor).
  const g = parseGeneration(p.store?.generation);
  const gen = g.ok ? g.value : {};
  const goodOr = <T,>(key: string, ok: (v: unknown) => boolean, empty: T): T => (ok(gen[key]) ? (gen[key] as T) : empty);
  const initial: StoreFieldsValues = {
    imagen_theme: p.store?.imagenTheme ?? "",
    photos: goodOr<PhotoSlotWords[] | null>("photos", (v) => Array.isArray(v) && v.every((w) => w && typeof w === "object" && typeof (w as PhotoSlotWords).label === "string"), null),
    name_max: goodOr<number | null>("name_max", (v) => Number.isInteger(v), null),
    photo_tips: goodOr<string>("photo_tips", (v) => typeof v === "string", ""),
    subject: goodOr<StoreFieldsValues["subject"]>("subject", (v) => v === "pet" || v === "person" || v === "any", ""),
    images_to_show: goodOr<number | null>("images_to_show", (v) => Number.isInteger(v), null),
    step_labels: goodOr<string[] | null>("step_labels", (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string"), null),
    related: p.store?.related ?? [],
    open_store_related: p.store?.relatedOnly === "true",
    details: p.store?.details ?? "",
    variants: p.variants.map((v) => ({ id: v.id, title: v.title, badge: readVariantField(v, "badge").state === "set" ? v.metafields.find((m) => m.key === "badge")!.value : "", lead_days: readVariantField(v, "lead_days").state === "set" ? v.metafields.find((m) => m.key === "lead_days")!.value : "" })),
  };
  const others = found.rows.filter((r) => r.store && r.product.id !== p.id).map((r) => ({ id: r.product.id, title: r.product.title }));
  const problems = productFieldProblems(p);

  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "shop_product" }} />
      <div>
        <Link href="/settings/shop" className="link text-[14px]">
          ← Products
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {p.media[0]?.url && <img src={p.media[0].url} alt="" className="h-14 w-14 rounded-[12px] object-cover" />}
          <h1 className="text-[30px] font-extrabold tracking-tight">{p.title}</h1>
        </div>
      </div>

      <section className={CARD} aria-labelledby="sold">
        <h2 id="sold" className="text-[19px] font-extrabold">
          Where it&apos;s sold
        </h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-[15px]">
          <li className="flex flex-wrap items-center gap-2">
            <Badge tone={row.shop ? "green" : "grey"}>{row.shop ? "IN" : "NOT IN"}</Badge> the Store collection (signed-in Gifts and Products pages)
            {admin(`collections/${s["shop.collection_id"]}`) && (
              <a href={admin(`collections/${s["shop.collection_id"]}`)!} target="_blank" rel="noreferrer" className="link">
                Open in Shopify
              </a>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <Badge tone={row.store ? "green" : "grey"}>{row.store ? "IN" : "NOT IN"}</Badge> the Magic Store collection (<code>{s["open_store.collection"]}</code>, the store at /store)
          </li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-2">
          Membership is changed in Shopify, by adding the product to a collection or removing it.
          {admin(`products/${p.legacyId}`) && (
            <>
              {" "}
              <a href={admin(`products/${p.legacyId}`)!} target="_blank" rel="noreferrer" className="link">
                Open the product in Shopify
              </a>
            </>
          )}
        </p>
      </section>

      <section className={CARD} aria-labelledby="both">
        <h2 id="both" className="text-[19px] font-extrabold">
          Both stores
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">These fields are shared: changing one changes it for the Gifts &amp; Products pages and the Magic Store.</p>
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-black/[0.03] p-3">
            <p className="text-[15px] font-semibold">Preview template: {p.template ? "set" : "not set yet"}</p>
            <Link href={`/settings/shop/template/${p.legacyId}`} className="link font-bold">
              Open template editor →
            </Link>
          </div>
          <ShortDescriptionEditor productId={p.id} initial={p.shortDescription ?? ""} />
          <div>
            <h3 className="mb-2 text-[16px] font-extrabold">Print rules</h3>
            <ShopRulesEditor productId={p.id} sizes={sizes} defaults={ruleDefaults} />
          </div>
        </div>
      </section>

      <section className={cn(CARD, !row.shop && "opacity-80")} aria-labelledby="pages">
        <h2 id="pages" className="text-[19px] font-extrabold">
          Gifts &amp; Products pages
        </h2>
        {row.shop && overview.ok ? (
          <div className="mt-3 max-w-[520px]">
            <ProductFieldsEditor productId={p.id} title={p.title} page={row.shop.page} occasions={p.occasions} choices={overview.occasions} categories={p.categories} categoryChoices={overview.categories} canSave={!overview.missingDefinitions.some((d) => d === "PRODUCT:page" || d === "PRODUCT:occasions")} />
          </div>
        ) : (
          <p className="mt-1 text-[14px] text-ink-2">Not in the Store collection. Add it in Shopify to sell it there.</p>
        )}
      </section>

      <section className={cn(CARD, !row.store && "opacity-80")} aria-labelledby="magic">
        <h2 id="magic" className="text-[19px] font-extrabold">
          Magic Store
        </h2>
        {row.store ? (
          <div className="mt-3">
            <StoreFieldsEditor
              productId={p.id}
              initial={initial}
              defaults={{
                photos: defaults.photos as PhotoSlotWords[],
                name_max: defaults.name_max as number,
                photo_tips: defaults.photo_tips as string,
                subject: defaults.subject as string,
                images_to_show: defaults.images_to_show as number,
                step_labels: defaults.step_labels as string[],
              }}
              themes={found.themes}
              others={others}
              problems={problems}
            />
          </div>
        ) : (
          <p className="mt-1 text-[14px] text-ink-2">Not in the Magic Store collection. Add it in Shopify to sell it there.</p>
        )}
      </section>

      <section className={CARD} aria-labelledby="status">
        <h2 id="status" className="text-[19px] font-extrabold">
          Status
        </h2>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          <div data-testid="status-shop">
            <dt className="text-[14px] font-bold">Gifts &amp; Products pages</dt>
            <dd className="mt-1 text-[14px]">
              {!row.shop ? (
                "Not in the Store collection"
              ) : row.shop.hidden.length ? (
                <>
                  <Badge tone="amber">HIDDEN</Badge>
                  <ul className="mt-1 list-disc pl-5 text-ink-2">
                    {row.shop.hidden.map((h) => (
                      <li key={h}>{HIDDEN_REASON_TEXT[h]}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <Badge tone="green">SHOWN</Badge>
              )}
            </dd>
          </div>
          <div data-testid="status-store">
            <dt className="text-[14px] font-bold">Magic Store</dt>
            <dd className="mt-1 text-[14px]">
              {!row.store ? (
                "Not in the Magic Store collection"
              ) : (
                <>
                  {row.store.hidden.length ? <Badge tone="amber">HIDDEN</Badge> : <Badge tone="green">{row.store.relatedOnly ? "RELATED ONLY" : "SHOWN"}</Badge>}
                  {(row.store.hidden.length > 0 || row.store.warnings.length > 0) && (
                    <ul className="mt-1 list-disc pl-5 text-ink-2">
                      {row.store.hidden.map((h) => (
                        <li key={h}>{STORE_HIDDEN_TEXT[h]}</li>
                      ))}
                      {row.store.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
