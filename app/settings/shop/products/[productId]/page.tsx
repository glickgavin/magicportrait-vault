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
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { dreamshipCard } from "@/lib/dreamship/link";
import { DreamshipCard } from "@/components/admin/shop/DreamshipCard";
import { CopySettings } from "@/components/admin/shop/CopySettings";
import { ProductTabs } from "@/components/admin/shop/ProductTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: product" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";

/** Settings › Shop › one product: every field of a product, for both stores, on one page (docs/open-store.md › Settings). */
export default async function ShopProductPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ copied?: string | string[]; tab?: string | string[] }> }) {
  await requireSuperUser();
  const { productId } = await params;
  // Set by "Copy settings from…": the editors start again from the copied values (a plain save keeps them as they are).
  const sp = await searchParams;
  const copied = sp.copied;
  const tabParam = typeof sp.tab === "string" ? sp.tab : "";
  const copyKey = typeof copied === "string" && /^\d{1,15}$/.test(copied) ? copied : "0";
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
  // The Dreamship card: for products linked to Dreamship, with Dreamship sizes, or whose SKUs suggest one.
  const ds = await dreamshipCard(p.legacyId).catch(() => null);
  const showDreamship = Boolean(ds && (ds.linkedId || ds.suggestion || p.variants.some((v) => v.metafields.some((f) => f.key === "maker" && f.value === "dreamship"))));
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
    ask_name: goodOr<boolean | null>("ask_name", (v) => typeof v === "boolean", null),
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

  const shopifyProduct = admin(`products/${p.legacyId}`);
  const warnings = problems.filter((x) => x.key === "ask_name");
  const shortDescription = (
    <div className="flex flex-col gap-1">
      <ShortDescriptionEditor key={`sd-${copyKey}`} productId={p.id} initial={p.shortDescription ?? ""} />
      <p className="text-[13px] text-ink-2">Also shown on the Gifts &amp; Products pages.</p>
    </div>
  );

  const magicTab = (
    <section className={CARD} aria-labelledby="magic">
      <h2 id="magic" className="sr-only">
        Magic Store
      </h2>
      {row.store ? (
        <div className="flex flex-col gap-6">
          <StoreFieldsEditor
            key={`store-${copyKey}`}
            productId={p.id}
            initial={initial}
            defaults={{
              photos: defaults.photos as PhotoSlotWords[],
              ask_name: defaults.ask_name as boolean,
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
          <div className="border-t border-line pt-5">{shortDescription}</div>
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">Not in the Magic Store collection. Add it in Shopify to sell it there.</p>
      )}
    </section>
  );

  const pagesTab = (
    <section className={CARD} aria-labelledby="pages">
      <h2 id="pages" className="sr-only">
        Gifts &amp; Products pages
      </h2>
      {row.shop && overview.ok ? (
        <div className="flex flex-col gap-6">
          <div className="max-w-[520px]">
            <ProductFieldsEditor productId={p.id} title={p.title} page={row.shop.page} occasions={p.occasions} choices={overview.occasions} categories={p.categories} categoryChoices={overview.categories} canSave={!overview.missingDefinitions.some((d) => d === "PRODUCT:page" || d === "PRODUCT:occasions")} />
          </div>
          {/* The short description lives with the Magic Store fields when the product is in both. */}
          {!row.store && <div className="border-t border-line pt-5">{shortDescription}</div>}
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">Not in the Store collection. Add it in Shopify to sell it there.</p>
      )}
    </section>
  );

  const printTab = (
    <div className="flex flex-col gap-5">
      <section className={CARD} aria-labelledby="rules">
        <h2 id="rules" className="text-[19px] font-extrabold">
          Print rules
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">What each size is made from and which pictures suit it. Shared by both stores.</p>
        <div className="mt-3">
          <ShopRulesEditor productId={p.id} sizes={sizes} defaults={ruleDefaults} />
        </div>
      </section>
      {showDreamship && ds && (
        <section className={CARD} aria-labelledby="dreamship">
          <h2 id="dreamship" className="text-[19px] font-extrabold">
            Dreamship
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">The printer&apos;s numbers for each size. Sync reads Dreamship; Save to Shopify writes only the print rules that differ. Cost and margin are shown, never written.</p>
          <div className="mt-3">
            <DreamshipCard initial={ds} productId={p.legacyId} />
          </div>
        </section>
      )}
    </div>
  );

  const tabs = [
    ...(row.store ? [{ id: "magic", label: "Magic Store", content: magicTab }] : []),
    { id: "pages", label: "Gifts & Products", tail: " pages", content: pagesTab },
    ...(!row.store ? [{ id: "magic", label: "Magic Store", content: magicTab }] : []),
    { id: "print", label: "Print rules", content: printTab },
  ];

  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "shop_product" }} />

      <header className={cn(CARD, "flex flex-col gap-4")}>
        <Link href="/settings/shop" className="link self-start text-[14px]">
          ← Products
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {p.media[0]?.url && <img src={p.media[0].url} alt="" className="h-14 w-14 rounded-[12px] object-cover" />}
          <h1 className="min-w-0 flex-1 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">{p.title}</h1>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2" aria-label="Where it's on sale">
          <div data-testid="status-shop" className="rounded-[14px] bg-black/[0.03] p-3">
            <dt className="text-[14px] font-bold">Gifts &amp; Products pages</dt>
            <dd className="mt-1 text-[14px]">
              {!row.shop ? (
                <>
                  <Badge tone="grey">NOT IN COLLECTION</Badge>
                  <p className="mt-1 text-ink-2">Add it to the Store collection in Shopify to sell it there.</p>
                </>
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
          <div data-testid="status-store" className="rounded-[14px] bg-black/[0.03] p-3">
            <dt className="text-[14px] font-bold">
              Magic Store <span className="font-normal text-ink-2">(collection <code>{s["open_store.collection"]}</code>)</span>
            </dt>
            <dd className="mt-1 text-[14px]">
              {!row.store ? (
                <>
                  <Badge tone="grey">NOT IN COLLECTION</Badge>
                  <p className="mt-1 text-ink-2">Add it to the Magic Store collection in Shopify to sell it there.</p>
                </>
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
        {warnings.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="product-warnings">
            {warnings.map((w) => (
              <li key={w.key} className="rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] font-semibold text-[#7a4a00]">
                {w.problem}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/settings/shop/template/${p.legacyId}`} className={buttonClass("primary", "md")}>
            Open template editor →
          </Link>
          <span className="text-[13px] text-ink-2">Preview template: {p.template ? "set" : "not set yet"}</span>
          {shopifyProduct && (
            <a href={shopifyProduct} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
              Open in Shopify
            </a>
          )}
        </div>
        <details className="group rounded-[14px] border border-line" data-testid="copy-settings-panel">
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DD07C4] [&::-webkit-details-marker]:hidden">
            Copy settings from…
            <span aria-hidden="true" className="text-ink-2 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="border-t border-line p-4">
            <p className="mb-3 text-[14px] text-ink-2">For a product made by duplicating another: take its settings in one go, then change the theme and photos.</p>
            <CopySettings productId={p.id} products={found.rows.filter((r) => r.product.id !== p.id).map((r) => ({ id: r.product.id, title: r.product.title, store: Boolean(r.store) }))} />
          </div>
        </details>
      </header>

      <ProductTabs tabs={tabs} initial={tabParam || tabs[0].id} />
    </div>
  );
}
