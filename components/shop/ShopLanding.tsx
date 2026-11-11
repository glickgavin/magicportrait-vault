import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { landingData, RecentPicture, ShopPage } from "@/lib/shop/pages";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TrackPageView } from "@/components/TrackPageView";
import { Price } from "./Price";

type Data = Awaited<ReturnType<typeof landingData>>;

/** The person's newest pictures; they stream in after the products so the page shows at once. */
async function RecentTiles({ recent, base }: { recent: Promise<RecentPicture[]>; base: string }) {
  const list = await recent;
  return list.map((p, i) =>
    p.url ? (
      <Link key={p.id} href={`${base}/i/${p.id}`} aria-label={t("shop.usePicture", { n: i + 1 })} className="aspect-square overflow-hidden rounded-[12px] bg-black/5">
        <img src={p.url} alt="" className="ph-no-capture h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      </Link>
    ) : null,
  );
}

const tileSkeleton = [0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="aspect-square animate-pulse rounded-[12px] bg-black/5" />);

/** The Gifts page (browse by occasion) or the Products page (browse by product type). */
export function ShopLanding({ page, data, recent }: { page: ShopPage; data: Data; recent: Promise<RecentPicture[]> }) {
  const gifts = page === "gifts";
  const base = `/${page}`;
  const choose = (product?: string) => `${base}/choose${product ? `?product=${encodeURIComponent(product)}` : ""}`;
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8">
      <TrackPageView event={gifts ? "page_view_gifts" : "page_view_products"} props={{ filter: data.chosen ?? "all", customer_type: data.pricing.customerType, products: data.total }} />
      <div className="flex flex-wrap items-stretch gap-6">
        <section aria-labelledby="shop-title" className="flex min-w-0 flex-[999_1_420px] flex-col justify-center gap-3">
          <h1 id="shop-title" className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-[42px]">
            {t(gifts ? "shop.giftsTitle" : "shop.productsTitle")}
          </h1>
          <p className="max-w-[560px] text-[15px] leading-6 text-ink-2 lg:text-[17px]">{t(gifts ? "shop.giftsSub" : "shop.productsSub")}</p>
          {data.groups.length > 0 && (
            <nav aria-label={t(gifts ? "shop.filterGifts" : "shop.filterProducts")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {[null, ...data.groups].map((g) => {
                const on = (g ?? null) === data.chosen;
                return (
                  <Link
                    key={g ?? "all"}
                    href={g ? `${base}?filter=${encodeURIComponent(g)}` : base}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-10 flex-none items-center rounded-full px-4 text-[14px]", on ? "border-2 border-magenta bg-pink-tint font-extrabold text-pink-dark" : "border border-black/15 bg-white font-semibold text-ink")}
                  >
                    {g ?? t("shop.all")}
                  </Link>
                );
              })}
            </nav>
          )}
        </section>
        <aside aria-labelledby="start-title" className="flex flex-[1_1_300px] flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] lg:max-w-[380px]">
          <div>
            <h2 id="start-title" className="text-[18px] font-extrabold">
              {t("shop.startTitle")}
            </h2>
            <p className="text-[14px] text-ink-2">{t(gifts ? "shop.startSubGifts" : "shop.startSubProducts", { count: data.topPicks })}</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Suspense fallback={tileSkeleton}>
              <RecentTiles recent={recent} base={base} />
            </Suspense>
            <Link href={choose()} className="flex aspect-square items-center justify-center rounded-[12px] bg-black/5 text-[14px] font-bold text-ink">
              {t("shop.more")}
            </Link>
          </div>
          <Link href={choose()} className="bg-primary-gradient shadow-primary flex h-12 items-center justify-center rounded-[12px] text-[16px] font-extrabold text-white">
            {t(gifts ? "shop.seeGiftIdeas" : "shop.seeProductIdeas")}
          </Link>
        </aside>
      </div>

      {data.sections.length === 0 && <p className="text-[15px] text-ink-2">{t("shop.noProducts")}</p>}
      {data.sections.map((sec, i) => (
        <section key={sec.title || `more-${i}`} aria-labelledby={`sec-${i}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`sec-${i}`} className="text-[22px] font-extrabold lg:text-[26px]">
              {sec.title || t(gifts ? "shop.otherGifts" : "shop.otherProducts")}
            </h2>
            {data.pricing.pct != null && <span className="rounded-full bg-pink-tint px-2.5 py-1 text-[12px] font-bold text-pink-dark">{t("shop.priceApplied", { label: data.pricing.label })}</span>}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
            {sec.products.map((p) => (
              <li key={p.handle}>
                <Link href={choose(p.handle)} className="flex h-full flex-col gap-2 rounded-[20px] bg-white p-2.5 text-ink shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                  {p.image ? <img src={p.image} alt="" className="aspect-square w-full rounded-[14px] object-cover" loading="lazy" /> : <span className="aspect-square w-full rounded-[14px] bg-black/5" aria-hidden="true" />}
                  <span className="px-1 text-[15px] font-bold leading-5">{p.title}</span>
                  <Price price={p.from} discounted={p.fromDiscounted} currency={data.pricing.currency} from={p.many} className="px-1 pb-1" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {gifts && data.groups.length > 1 && !data.chosen && (
        <section aria-labelledby="by-occasion" className="flex flex-col gap-3">
          <h2 id="by-occasion" className="text-[22px] font-extrabold lg:text-[26px]">
            {t("shop.filterGifts")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {data.groups.map((g) => (
              <li key={g}>
                <Link href={`${base}?filter=${encodeURIComponent(g)}`} className="flex h-16 items-center justify-between rounded-[16px] bg-white px-4 text-[16px] font-extrabold text-ink shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                  {g}
                  <ChevronRight className="h-5 w-5 text-pink-link" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[13px] text-ink-2">{t("shop.shipsNote")}</p>
    </div>
  );
}
