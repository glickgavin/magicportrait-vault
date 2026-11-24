import Link from "next/link";
import type { Circle } from "@/lib/open-store/pages";
import type { StoreSort } from "@/lib/open-store/view";
import { t } from "@/lib/i18n";
import { TrackPageView } from "@/components/TrackPageView";
import { TrackedLink } from "@/components/TrackedLink";
import { cn } from "@/lib/utils";
import { ProductCard } from "./ProductCard";
import { StoreToolbar } from "./StoreToolbar";
import type { storePageData } from "@/lib/open-store/pages";

type Data = NonNullable<Awaited<ReturnType<typeof storePageData>>>;

/** The store page (docs/open-store.md › Store page): category circles, heading and intro, filter and sort, the grid. */
export function StorePage({ data, circles, base, sort, page }: { data: Data; circles: Circle[]; base: string; sort: StoreSort; page: number }) {
  const moreHref = () => {
    const q = new URLSearchParams();
    if (data.type) q.set("type", data.type);
    if (sort !== "featured") q.set("sort", sort);
    q.set("page", String(page + 1));
    return `${base}?${q.toString()}`;
  };
  return (
    <>
      <TrackPageView event="page_view_store" props={{ collection: data.collection.handle, products_shown: data.cards.length, products_total: data.total }} />
      {circles.length > 0 && (
        <nav aria-label={t("store.categories")} className="no-scrollbar flex gap-3.5 overflow-x-auto border-b border-[#EDEAE2] px-4 pb-3.5 pt-4 lg:justify-center lg:gap-8 lg:border-0 lg:pt-8">
          {circles.map((c, i) => {
            const on = c.handle === data.collection.handle;
            return (
              <TrackedLink key={c.handle} href={c.href} event="store_category_tapped" props={{ collection: c.handle, position: i + 1 }} current={on} className="flex w-[78px] flex-none flex-col items-center gap-[7px] text-ink lg:w-[110px]">
                <span className={cn("block h-[74px] w-[74px] rounded-full lg:h-[96px] lg:w-[96px]", on ? "bg-avatar-gradient p-[3px]" : "")}>
                  {c.image ? (
                    <img src={c.image} alt="" className={cn("block h-full w-full rounded-full object-cover", on ? "border-2 border-white" : "border border-[#E7E3D8]")} />
                  ) : (
                    <span className={cn("block h-full w-full rounded-full bg-page", on ? "border-2 border-white" : "border border-[#E7E3D8]")} aria-hidden="true" />
                  )}
                </span>
                <span className={cn("text-center text-[13px] leading-tight", on ? "font-extrabold" : "font-medium")}>{c.title}</span>
              </TrackedLink>
            );
          })}
        </nav>
      )}
      <section className="mx-auto flex max-w-[640px] flex-col gap-2.5 px-[22px] pb-[22px] pt-[26px] text-center">
        <h1 className="font-serif text-[36px] font-normal leading-[1.1] text-[#1a1a1a] lg:text-[52px]">{data.collection.title}</h1>
        {data.collection.description && <p className="text-[16px] leading-[1.55] text-[#4d4d4d] lg:text-[18px]">{data.collection.description}</p>}
      </section>
      <StoreToolbar base={base} collection={data.collection.handle} types={data.types} type={data.type} sort={sort} total={data.total} />
      <div className="mx-auto max-w-[1280px] lg:px-10">
        {data.cards.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-[22px] px-4 pb-2 pt-[18px] sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-[34px] lg:px-0 lg:pt-7" data-testid="store-grid">
            {data.cards.map((c, i) => (
              <ProductCard key={c.id} card={c} currency={data.pricing.currency} position={i + 1} collection={data.collection.handle} />
            ))}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-[16px] text-ink-2">{t("store.nothingHere")}</p>
        )}
        {data.more && (
          <div className="flex justify-center px-4 pb-[30px] pt-[18px]">
            <Link href={moreHref()} scroll={false} className="flex h-12 items-center rounded-[12px] border-[1.5px] border-[#1f1f1f] bg-white px-7 text-[15px] font-extrabold text-[#1f1f1f]">
              {t("store.showMore")}
            </Link>
          </div>
        )}
        <div className="h-8" />
      </div>
    </>
  );
}
