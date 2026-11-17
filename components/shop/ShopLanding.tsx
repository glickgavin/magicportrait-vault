import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Images } from "lucide-react";
import type { CardView, LandingPictures, LandingPreview, landingData, ShopPage } from "@/lib/shop/pages";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TrackPageView } from "@/components/TrackPageView";
import { Price } from "./Price";
import { ShopPreview } from "./ShopPreview";

type Data = Awaited<ReturnType<typeof landingData>>;

const tileSkeleton = [0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="aspect-square animate-pulse rounded-[12px] bg-black/5" />);

type Pic = NonNullable<LandingPictures["selected"]>;
const withParams = (base: string, filter: string | null, pic: string | null) => {
  const q = new URLSearchParams();
  if (filter) q.set("filter", filter);
  if (pic) q.set("pic", pic);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

/** One product: drawn with the person's picture when it suits it, else the product's own photo. */
function ProductCard({ p, preview, pic, base, choose, currency, loading = false }: { p: CardView; preview: LandingPreview | undefined; pic: Pic | null; base: string; choose: string; currency: string; loading?: boolean }) {
  const href = preview && pic ? `${base}/i/${pic.id}?product=${encodeURIComponent(p.handle)}` : choose;
  return (
    <li>
      <Link href={href} className="flex h-full flex-col gap-2 rounded-[20px] bg-white p-2.5 text-ink shadow-[0_1px_4px_rgba(0,0,0,0.04)]" data-testid="shop-card" data-preview={preview && pic ? "yours" : "product"}>
        <span className="block aspect-square w-full overflow-hidden rounded-[14px] bg-black/5">
          {preview && pic ? (
            <ShopPreview
              template={preview.template}
              pictureUrl={pic.url}
              crop={preview.crop}
              placement={preview.placement}
              aspect={preview.aspect}
              background={preview.background}
              pictureSize={pic.width && pic.height ? { width: pic.width, height: pic.height } : null}
              width={320}
              alt={t("shop.previewOn", { product: p.title })}
              className="h-full w-full rounded-none object-cover object-top"
            />
          ) : loading ? (
            // Their own picture is on its way: a placeholder, never the plain product photo first.
            <span aria-hidden="true" className="block h-full w-full animate-pulse bg-black/[0.06]" data-testid="card-loading" />
          ) : p.image ? (
            <img src={p.image} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          ) : null}
        </span>
        <span className="px-1 text-[15px] font-bold leading-5">{p.title}</span>
        <Price price={p.from} discounted={p.fromDiscounted} currency={currency} from={p.many} className="px-1 pb-1" />
      </Link>
    </li>
  );
}

/** Choose your picture: the one on the products, three more (one tap switches) and the gallery (every picture, upload). */
function PictureBar({ gifts, pictures, base, filter, choose }: { gifts: boolean; pictures: LandingPictures; base: string; filter: string | null; choose: string }) {
  const pic = pictures.selected!;
  const others = pictures.others.filter((o) => o.url).slice(0, 3);
  const tile = "aspect-square overflow-hidden rounded-[14px] bg-black/5";
  return (
    <aside aria-labelledby="start-title" className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] md:flex-row md:items-center md:gap-6 md:p-5" data-testid="picture-bar">
      <div className="md:min-w-0 md:flex-1">
        <h2 id="start-title" className="text-[20px] font-extrabold">
          {t("shop.choosePicture")}
        </h2>
        <p className="text-[14px] text-ink-2">{t(gifts ? "shop.shownSubGifts" : "shop.shownSub")}</p>
      </div>
      <ul className="grid grid-cols-5 gap-2 md:w-[480px] md:flex-none md:gap-3">
        <li className={cn(tile, "ring-[3px] ring-magenta ring-offset-2")}>
          <img src={pic.url} alt={t("shop.selectedPicture")} className="ph-no-capture h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
        </li>
        {others.map((o, i) => (
          <li key={o.id} className={tile}>
            <Link href={withParams(base, filter, o.id)} scroll={false} aria-label={t("shop.showPicture", { n: i + 2 })} className="block h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-magenta/40">
              <img src={o.url!} alt="" className="ph-no-capture h-full w-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />
            </Link>
          </li>
        ))}
        {/* Always there: every picture, and Upload. */}
        <li className={cn(tile, "col-start-5 bg-pink-tint")}>
          <Link href={choose} aria-label={t("shop.galleryLabel")} className="flex h-full w-full flex-col items-center justify-center gap-1 text-pink-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-magenta/40">
            <Images className="h-7 w-7" aria-hidden="true" />
            <span className="text-[12px] font-extrabold">{t("shop.gallery")}</span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}

/** While their pictures load: the Choose your picture box with placeholders, so nothing jumps. */
function PictureBarLoading({ gifts }: { gifts: boolean }) {
  return (
    <aside aria-labelledby="start-title" aria-busy="true" className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] md:flex-row md:items-center md:gap-6 md:p-5" data-testid="picture-bar-loading">
      <div className="md:min-w-0 md:flex-1">
        <h2 id="start-title" className="text-[20px] font-extrabold">
          {t("shop.choosePicture")}
        </h2>
        <p className="text-[14px] text-ink-2">{t(gifts ? "shop.shownSubGifts" : "shop.shownSub")}</p>
      </div>
      <div className="grid grid-cols-5 gap-2 md:w-[480px] md:flex-none md:gap-3" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-[14px] bg-black/[0.06]" />
        ))}
      </div>
    </aside>
  );
}

/** Before they have any picture: the old "Start with a picture" box. */
function StartBox({ gifts, topPicks, choose, loading }: { gifts: boolean; topPicks: number; choose: string; loading: boolean }) {
  return (
    <aside aria-labelledby="start-title" className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] md:flex-row md:items-center md:gap-5 md:p-5">
      <div className="md:min-w-0 md:flex-1">
        <h2 id="start-title" className="text-[18px] font-extrabold">
          {t("shop.startTitle")}
        </h2>
        <p className="text-[14px] text-ink-2">{t(gifts ? "shop.startSubGifts" : "shop.startSubProducts", { count: topPicks })}</p>
      </div>
      {loading && <div className="grid grid-cols-4 gap-2 md:w-[296px] md:flex-none">{tileSkeleton}</div>}
      <Link href={choose} className="bg-primary-gradient shadow-primary flex h-12 items-center justify-center rounded-[12px] px-5 text-[16px] font-extrabold text-white md:w-[220px] md:flex-none">
        {t(gifts ? "shop.seeGiftIdeas" : "shop.seeProductIdeas")}
      </Link>
    </aside>
  );
}

/** The Gifts page (browse by occasion) or the Products page (browse by product type). */
export function ShopLanding({ page, data, pictures }: { page: ShopPage; data: Data; pictures: Promise<LandingPictures> }) {
  const gifts = page === "gifts";
  const base = `/${page}`;
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-8">
      <TrackPageView event={gifts ? "page_view_gifts" : "page_view_products"} props={{ filter: data.chosen ?? "all", customer_type: data.pricing.customerType, products: data.total }} />
      {/* Title, filters, then "Start with a picture" right under the filters (a single row on wider screens). */}
      <div className="flex flex-col gap-5">
        <section aria-labelledby="shop-title" className="flex min-w-0 flex-col gap-3">
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
      </div>

      <Suspense fallback={<Body page={page} data={data} pictures={null} />}>
        <WithPictures page={page} data={data} pictures={pictures} />
      </Suspense>

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

/** The picture box and the product sections; `pictures` is null while the person's pictures load. */
function Body({ page, data, pictures }: { page: ShopPage; data: Data; pictures: LandingPictures | null }) {
  const gifts = page === "gifts";
  const base = `/${page}`;
  const choose = (product?: string) => `${base}/choose${product ? `?product=${encodeURIComponent(product)}` : ""}`;
  const pic = pictures?.selected ?? null;
  return (
    <>
      {pic ? (
        <PictureBar gifts={gifts} pictures={pictures!} base={base} filter={data.chosen} choose={choose()} />
      ) : pictures === null ? (
        <PictureBarLoading gifts={gifts} />
      ) : (
        <StartBox gifts={gifts} topPicks={data.topPicks} choose={choose()} loading={false} />
      )}
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
              <ProductCard key={p.handle} p={p} preview={pictures?.previews[p.handle]} pic={pic} base={base} choose={choose(p.handle)} currency={data.pricing.currency} loading={pictures === null} />
            ))}
          </ul>
        </section>
      ))}

    </>
  );
}

async function WithPictures({ page, data, pictures }: { page: ShopPage; data: Data; pictures: Promise<LandingPictures> }) {
  return <Body page={page} data={data} pictures={await pictures} />;
}
