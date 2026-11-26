import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { settingRows } from "@/lib/admin/data";
import { getStoreCatalog, imagenThemes } from "@/lib/open-store";
import { getOpenStoreSource } from "@/lib/open-store/sources";
import { themesInUse } from "@/lib/open-store/admin";
import { categoryKey, listedThemes } from "@/lib/open-store/view";
import { storeNumbers } from "@/lib/open-store/numbers-load";
import { StoreNumbers } from "@/components/admin/shop/StoreNumbers";
import { getSettings } from "@/lib/settings";
import { getShopCatalogSource } from "@/lib/shop/sources";
import { SettingField } from "@/components/admin/SettingField";
import { RefreshThemesButton } from "@/components/admin/shop/StoreFieldsEditor";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: Magic Store" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";

/** The store's own settings, grouped as on the page (docs/open-store.md › Settings: one area for both stores). */
const GROUPS: [string, string, string[]][] = [
  ["store-who", "Who sees the Magic Store", ["open_store.enabled", "open_store.super_user_preview"]],
  ["store-catalogue", "Collection and menu", ["open_store.collection", "open_store.home_collection", "open_store.menu_handle", "open_store.theme_category", "open_store.storefront_publication_id", "open_store.products_per_page"]],
  ["store-prices", "Discount", ["open_store.discount_code", "open_store.discount_label"]],
  ["store-page", "Product page", ["open_store.reassurance", "open_store.how_it_works", "open_store.shipping_days", "open_store.more_gifts_step", "open_store.picture_options"]],
  ["store-pictures", "Pictures: limits and timings", ["open_store.upload_max_px", "open_store.min_photo_px", "open_store.slow_after_s", "open_store.timeout_s", "open_store.generations_per_visitor_per_day", "open_store.generations_per_ip_per_day", "open_store.generations_daily_cap"]],
  ["store-visitors", "Visitors and the email ask", ["open_store.visitor_cookie_days", "open_store.ask_email_while_painting", "open_store.email_link_days", "open_store.emails_per_address_per_day"]],
  ["store-defaults", "Store defaults for every product", ["open_store.photos", "open_store.ask_name", "open_store.name_max", "open_store.photo_tips", "open_store.subject", "open_store.images_to_show", "open_store.step_labels"]],
];

export default async function MagicStoreSettings() {
  await requireSuperUser();
  const s = await getSettings(["open_store.collection", "open_store.menu_handle", "open_store.home_collection", "open_store.posthog_dashboard_url", "shop.metafield_namespace", "open_store.theme_category"] as const);
  const [rows, catalog, themes, menu, home, defs, numbers] = await Promise.all([
    settingRows(),
    getStoreCatalog({ fresh: true }).catch(() => null),
    imagenThemes({ fresh: true }),
    getOpenStoreSource()
      .then((src) => src.menu(s["open_store.menu_handle"]))
      .catch(() => undefined),
    getOpenStoreSource()
      .then((src) => src.collection(s["open_store.home_collection"]))
      .catch(() => undefined),
    getShopCatalogSource()
      .then((src) => src.fieldDefinitions(s["shop.metafield_namespace"]))
      .catch(() => null),
    storeNumbers().catch(() => null),
  ]);
  const pick = (keys: string[]) => keys.map((k) => rows.find((r) => r.key === k)).filter((r) => r !== undefined);
  const dropdown = defs?.find((d) => d.ownerType === "PRODUCT" && d.key === "imagen_theme")?.choices ?? null;
  // Only the Magic Store's own themes (open_store.theme_category), plus any a product already uses.
  const category = s["open_store.theme_category"].trim();
  const used = new Set(themesInUse(catalog?.entries ?? []));
  const listed = themes ? listedThemes(themes, category, used) : null;
  const inCategory = themes && category ? themes.filter((t) => categoryKey(t.category) === categoryKey(category)).length : null;
  const otherCategories = themes && category && !inCategory ? [...new Set(themes.map((t) => t.category ?? "no category"))].sort() : [];
  const shown = catalog?.entries.filter((e) => !e.hidden.length) ?? [];
  const dashboard = rows.find((r) => r.key === "open_store.posthog_dashboard_url");

  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_magic_store" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Magic Store</h1>
      <p className="max-w-[860px] text-[15px] text-ink-2">
        The store at <code>/store</code>, where anyone can make a picture and buy without signing in. Each product&apos;s own fields (theme, picture settings, more gifts) are on its page under{" "}
        <Link href="/settings/shop?filter=magic" className="link font-bold">
          Products
        </Link>
        ; the store defaults below apply wherever a product has none.
      </p>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          {GROUPS.map(([id, title, keys]) => (
            <section key={id} className={CARD} aria-labelledby={id}>
              <h2 id={id} className="text-[19px] font-extrabold">
                {title}
              </h2>
              {id === "store-who" && <p className="text-[14px] text-ink-2">With both off, nobody sees it and every store address is “not found”.</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {pick(keys).map((r) => (
                  <div key={r.key} className={`flex gap-3 rounded-[14px] bg-black/[0.03] p-3 ${r.type === "boolean" ? "items-center justify-between" : "flex-col"} ${r.type === "json" || r.type === "list" ? "sm:col-span-2" : ""}`}>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{r.label}</p>
                      {r.description && <p className="text-[13px] text-ink-2">{r.description}</p>}
                    </div>
                    <SettingField row={r} compact={r.type !== "boolean"} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <section className={CARD} aria-labelledby="store-status">
            <h2 id="store-status" className="text-[19px] font-extrabold">
              In Shopify now
            </h2>
            <ul className="mt-2 flex flex-col gap-2 text-[14px]">
              <li className="flex items-start gap-2">
                <Badge tone={catalog?.collection ? "green" : "red"}>{catalog?.collection ? "OK" : "MISSING"}</Badge>
                <span>
                  Collection <code>{s["open_store.collection"]}</code>
                  {catalog?.collection ? `: ${catalog.entries.length} products, ${shown.length} shown. ` : " wasn't found. "}
                  <Link href="/settings/shop?filter=magic" className="link">
                    See why products are hidden
                  </Link>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge tone={home ? "green" : "red"}>{home ? "OK" : "MISSING"}</Badge>
                <span>
                  Home collection <code>{s["open_store.home_collection"]}</code>
                  {home ? `: “${home.title}”` : " wasn't found"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge tone={menu ? "green" : "amber"}>{menu ? "OK" : "MISSING"}</Badge>
                <span>
                  Menu <code>{s["open_store.menu_handle"]}</code>
                  {menu
                    ? `: ${menu.items.length} categories (${menu.items.map((i) => i.title).join(", ")})`
                    : menu === null
                      ? " wasn't found, so the store shows no category circles. Make it in Shopify admin › Online Store › Navigation, with one item per collection."
                      : " couldn't be read from Shopify, so the store shows no category circles. Reading menus needs the app's read_online_store_navigation access (Shopify access, on Gifts & Products pages)."}
                </span>
              </li>
            </ul>
          </section>

          <section className={CARD} aria-labelledby="store-themes">
            <h2 id="store-themes" className="text-[19px] font-extrabold">
              Imagen themes
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">
              Each product names one theme (its art style). The theme field in Shopify is a dropdown of these;{" "}
              {dropdown?.length ? `it has ${dropdown.length} now.` : "it's plain text until it's refreshed."}
            </p>
            {themes && category && (
              <p className="mt-1 text-[14px] text-ink-2" data-testid="imagen-themes-category">
                Showing the {inCategory} theme{inCategory === 1 ? "" : "s"} in Imagen&apos;s category <strong>{category}</strong>
                {listed && inCategory != null && listed.length > inCategory ? `, plus ${listed.length - inCategory} in another category that a product uses` : ""}, out of {themes.length}. The category is a setting under Collection and menu; leave it empty to show every theme.
              </p>
            )}
            {themes && category && !inCategory && (
              <p role="alert" className="mt-2 text-[14px] font-bold text-[#a1251b]">
                No Imagen theme is in the category “{category}”. Imagen&apos;s categories: {otherCategories.join(", ")}.
              </p>
            )}
            {listed ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-[14px]" data-testid="imagen-themes">
                {listed.map((t) => (
                  <li key={t.slug} className="flex flex-wrap items-center gap-2">
                    <Badge tone={t.active ? "green" : "grey"}>{t.active ? "ACTIVE" : "INACTIVE"}</Badge>
                    {category && categoryKey(t.category) !== categoryKey(category) && <Badge tone="grey">IN USE · {t.category ?? "no category"}</Badge>}
                    <span className="font-semibold">{t.name}</span>
                    <code className="text-[13px]">{t.slug}</code>
                    <span className="text-ink-2">{t.photos ? `${t.photos} photo${t.photos === 1 ? "" : "s"}` : "photos: not stated"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="alert" className="mt-2 text-[14px] text-[#a1251b]">
                Couldn&apos;t read Imagen&apos;s theme list (check IMAGEN_API_URL and IMAGEN_API_KEY in Vercel).
              </p>
            )}
            <div className="mt-4">
              <RefreshThemesButton />
            </div>
          </section>

          <section className={CARD} aria-labelledby="store-numbers">
            <h2 id="store-numbers" className="text-[19px] font-extrabold">
              Numbers
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">From the app&apos;s own tables, not PostHog. Test orders aren&apos;t counted.</p>
            {numbers ? (
              <StoreNumbers numbers={numbers} titles={new Map((catalog?.entries ?? []).map((e) => [e.product.legacyId, e.product.title]))} themes={new Map((themes ?? []).map((t) => [t.slug, t.name]))} />
            ) : (
              <p className="mt-2 text-[14px] text-ink-2">Couldn&apos;t read the numbers.</p>
            )}
            {dashboard && (
              <div className="mt-3 flex flex-col gap-1 rounded-[14px] bg-black/[0.03] p-3">
                <p className="text-[14px] font-semibold">{dashboard.label}</p>
                <SettingField row={dashboard} compact />
                {typeof dashboard.value === "string" && dashboard.value && (
                  <a href={dashboard.value} target="_blank" rel="noreferrer" className="link text-[14px] font-bold">
                    Open the dashboard in PostHog →
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
