import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { settingRows } from "@/lib/admin/data";
import { shopAccess, shopOverview } from "@/lib/shop/admin";
import { SettingField } from "@/components/admin/SettingField";
import { CategoriesEditor, OccasionsEditor } from "@/components/admin/shop/ShopEditors";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";
import type { DiscountInfo } from "@/lib/shop/sources/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: Gifts & Products pages" };

const SWITCH_KEYS = ["shop.enabled", "shop.super_user_preview"];
const DISCOUNT_KEYS = ["shop.discount_code_normal", "shop.discount_code_vip", "shop.vip_customer_tag", "shop.discount_label_normal", "shop.discount_label_vip"];
const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";

function discountLine(info: DiscountInfo | null, code: string | null, collectionGid: string): { tone: "green" | "amber" | "red" | "grey"; text: string } {
  if (!code) return { tone: "grey", text: "No code: prices show without a discount." };
  if (!info) return { tone: "red", text: `“${code}” wasn't found in Shopify, so prices show without it.` };
  const value = info.percentage != null ? `${Math.round(info.percentage * 100)}% off` : info.amount ? `${info.amount.amount} ${info.amount.currency} off` : "a discount";
  const scope = info.collections === null ? "everything" : info.collections.includes(collectionGid) ? "the Store collection" : "other products (not the Store collection)";
  const combines = info.combinesWithProduct || info.combinesWithOrder ? "Combines with other discounts." : "Doesn't combine with other discounts.";
  const tone = info.status !== "ACTIVE" ? "amber" : info.collections !== null && !info.collections.includes(collectionGid) ? "amber" : "green";
  if (info.automatic) {
    return { tone, text: `Automatic discount (no code), ${info.status === "ACTIVE" ? "active" : info.status.toLowerCase()}: ${info.summary ?? `${value} on ${scope}`}${info.endsAt ? `, ends ${info.endsAt.slice(0, 10)}` : ""}. Prices here show it; Shopify applies it at checkout when it recognises the customer as one of its segments.` };
  }
  return { tone, text: `${info.status === "ACTIVE" ? "Active" : info.status.toLowerCase()}: ${value} on ${scope}${info.endsAt ? `, ends ${info.endsAt.slice(0, 10)}` : ", no end date"}. ${combines}` };
}

export default async function ShopPagesSettings() {
  await requireSuperUser();
  const [rows, overview, access] = await Promise.all([settingRows(), shopOverview(), shopAccess()]);
  const pick = (keys: string[]) => keys.map((k) => rows.find((r) => r.key === k)!).filter(Boolean);

  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_pages" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Gifts &amp; Products pages</h1>
      <p className="text-[15px] text-ink-2">
        The signed-in shop: who sees it, its occasion and category lists, discounts and the promotion bar. Its products come from the Store collection in Shopify; each product&apos;s page, occasions and categories are set on its own page under{" "}
        <Link href="/settings/shop" className="link font-bold">
          Products
        </Link>
        .
      </p>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={CARD} aria-labelledby="shop-switches">
            <h2 id="shop-switches" className="text-[19px] font-extrabold">
              Who sees the shop
            </h2>
            <p className="text-[14px] text-ink-2">With both off, nobody sees it and every shop address is “not found”.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {pick(SWITCH_KEYS).map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 rounded-[14px] bg-black/[0.03] p-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{r.label}</p>
                    <p className="text-[13px] text-ink-2">{r.description}</p>
                  </div>
                  <SettingField row={r} />
                </div>
              ))}
            </div>
          </section>

          {!overview.ok && (
            <section className={CARD} aria-labelledby="shop-error">
              <h2 id="shop-error" className="text-[19px] font-extrabold">
                Shopify
              </h2>
              <p role="alert" className="mt-2 text-[15px] text-[#a1251b]">
                {overview.error}
              </p>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {overview.ok && (
            <section className={CARD} aria-labelledby="shop-occasions">
              <h2 id="shop-occasions" className="text-[19px] font-extrabold">
                Occasions
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">The Gifts page&apos;s chips and sections, in this order. Saved in Shopify as the choices of the <code>mmp_shop.occasions</code> field.</p>
              {!overview.occasionsFromDefinition && overview.occasions.length > 0 && <p className="mt-2 text-[13px] text-[#7a4a00]">Not saved as a list in Shopify yet; showing the occasions products use.</p>}
              <div className="mt-3">
                <OccasionsEditor initial={overview.occasions} enabled={!overview.missingDefinitions.includes("PRODUCT:occasions")} />
              </div>
            </section>
          )}
          {overview.ok && (
            <section className={CARD} aria-labelledby="shop-categories">
              <h2 id="shop-categories" className="text-[19px] font-extrabold">
                Categories
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">The Products page&apos;s chips and sections, in this order, just like occasions on Gifts. Saved in Shopify as the choices of the <code>mmp_shop.categories</code> field. A product with no category is grouped by its Shopify product type.</p>
              {overview.missingDefinitions.includes("PRODUCT:categories") ? (
                <p className="mt-2 text-[13px] text-[#7a4a00]">Create the shop fields in Shopify first (above): the new categories field starts with the product types products use now.</p>
              ) : (
                !overview.categoriesFromDefinition && overview.categories.length > 0 && <p className="mt-2 text-[13px] text-[#7a4a00]">Not saved as a list in Shopify yet; showing the categories and product types products use.</p>
              )}
              <div className="mt-3">
                <CategoriesEditor initial={overview.categories} enabled={!overview.missingDefinitions.includes("PRODUCT:categories")} />
              </div>
            </section>
          )}

          <section className={CARD} aria-labelledby="shop-access">
            <h2 id="shop-access" className="text-[19px] font-extrabold">
              Shopify access
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
              {access.scopes ? (
                access.scopes.map((s) => (
                  <li key={s.scope} className="flex items-center gap-2">
                    <Badge tone={s.ok ? "green" : "red"}>{s.ok ? "OK" : "MISSING"}</Badge>
                    <code>{s.scope}</code>
                  </li>
                ))
              ) : (
                <li className="text-ink-2">Couldn&apos;t read the app&apos;s permissions from Shopify.</li>
              )}
              <li className="flex items-center gap-2">
                <Badge tone={access.storefront ? "green" : "red"}>{access.storefront ? "OK" : "MISSING"}</Badge>
                Storefront token for carts (<code>SHOPIFY_STOREFRONT_TOKEN</code>)
              </li>
              <li className="flex items-center gap-2">
                <Badge tone={access.fulfilmentSecret ? "green" : "amber"}>{access.fulfilmentSecret ? "OK" : "NOT SET"}</Badge>
                Fresh links for the fulfilment side (<code>SHOP_FULFILMENT_SECRET</code>)
              </li>
            </ul>
          </section>

          <section className={CARD} aria-labelledby="shop-promo">
            <h2 id="shop-promo" className="text-[19px] font-extrabold">
              Promotion bar
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">
              Shown above the header on every page while the shop is visible. A list of bars: each has <code>id</code>, <code>on</code>, <code>text</code>, <code>link_label</code>, <code>link_url</code> (e.g. /gifts), <code>audience</code> (everyone, normal or vip), <code>starts</code> and <code>ends</code> (YYYY-MM-DD, business time), <code>style</code> (tint or gradient) and <code>closable</code>.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              {pick(["site.promo_bars", "site.promo_bar_max_chars"]).map((r) => (
                <div key={r.key} className="flex flex-col gap-1 rounded-[14px] bg-black/[0.03] p-3">
                  <p className="text-[14px] font-semibold">{r.label}</p>
                  <SettingField row={r} compact />
                </div>
              ))}
            </div>
          </section>

          <section className={CARD} aria-labelledby="shop-discounts">
            <h2 id="shop-discounts" className="text-[19px] font-extrabold">
              Discounts
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">Two Shopify discount codes: one for normal customers, one for customers with the VIP tag. Prices show with the customer&apos;s code, and checkout opens with it applied.</p>
            {overview.ok && (
              <ul className="mt-3 flex flex-col gap-2 text-[14px]">
                {(
                  [
                    ["Normal", overview.discounts.normal.code, overview.discounts.normal.info],
                    ["VIP", overview.discounts.vip.code, overview.discounts.vip.info],
                  ] as const
                ).map(([who, code, info]) => {
                  const l = discountLine(info, code, `gid://shopify/Collection/${overview.collectionId}`);
                  return (
                    <li key={who} className="flex items-start gap-2">
                      <Badge tone={l.tone} className="mt-0.5">
                        {who.toUpperCase()}
                      </Badge>
                      <span>
                        {code ? <code className="font-bold">{code}</code> : null} {l.text}
                        {who === "VIP" && overview.discounts.vip.fallsBack ? " (No VIP code set, so VIPs get the normal code.)" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex flex-col gap-3">
              {pick(DISCOUNT_KEYS).map((r) => (
                <div key={r.key} className="flex flex-col gap-1 rounded-[14px] bg-black/[0.03] p-3">
                  <p className="text-[14px] font-semibold">{r.label}</p>
                  <SettingField row={r} compact />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
