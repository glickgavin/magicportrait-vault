"use client";

import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { SORTS, type StoreSort } from "@/lib/open-store/view";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

/** Filter (product types in the collection) and Sort, as links so the address keeps the choice. */
export function StoreToolbar({ base, collection, types, type, sort, total }: { base: string; collection: string; types: string[]; type: string | null; sort: StoreSort; total: number }) {
  const [open, setOpen] = useState<"filter" | "sort" | null>(null);
  const uid = useId();
  const href = (next: { type?: string | null; sort?: StoreSort }) => {
    const q = new URLSearchParams();
    const ty = next.type === undefined ? type : next.type;
    const so = next.sort ?? sort;
    if (ty) q.set("type", ty);
    if (so !== "featured") q.set("sort", so);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (on: boolean) => cn("flex h-10 items-center rounded-full px-4 text-[14px]", on ? "border-2 border-[#DD07C4] bg-pink-tint font-extrabold text-pink-dark" : "border border-black/15 bg-white font-semibold text-ink");
  return (
    <div className="border-y border-[#E7E3D8]">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 lg:flex lg:items-center lg:justify-between lg:px-10 lg:py-2">
        <div className="flex items-center lg:gap-4">
          <button
            type="button"
            aria-expanded={open === "filter"}
            aria-controls={`${uid}-filter`}
            disabled={!types.length}
            onClick={() => setOpen((o) => (o === "filter" ? null : "filter"))}
            className="flex h-[52px] w-full items-center justify-center gap-2 border-r border-[#E7E3D8] bg-white text-[13px] font-bold uppercase tracking-[0.12em] text-[#4d4d4d] disabled:opacity-50 lg:h-10 lg:w-auto lg:rounded-[10px] lg:border lg:px-4"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t("store.filter")}
            {type ? ` · ${type}` : ""}
          </button>
          <span className="hidden text-[14px] text-ink-2 lg:inline" data-testid="store-count">
            {total === 1 ? "1 product" : `${total} products`}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={open === "sort"}
          aria-controls={`${uid}-sort`}
          onClick={() => setOpen((o) => (o === "sort" ? null : "sort"))}
          className="flex h-[52px] w-full items-center justify-center gap-2 bg-white text-[13px] font-bold uppercase tracking-[0.12em] text-[#4d4d4d] lg:h-10 lg:w-auto"
        >
          {t("store.sortLabel", { label: t(`store.sorts.${sort}`) })}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {open === "filter" && (
        <nav id={`${uid}-filter`} aria-label={t("store.filterBy")} className="mx-auto flex max-w-[1280px] flex-wrap gap-2 border-t border-[#E7E3D8] px-4 py-3 lg:px-10">
          {[null, ...types].map((ty) => (
            <Link key={ty ?? "all"} href={href({ type: ty })} scroll={false} aria-current={ty === type ? "page" : undefined} className={chip(ty === type)} onClick={() => trackClient("store_filter_changed", { collection, value: ty ?? "all" })}>
              {ty ?? t("store.allTypes")}
            </Link>
          ))}
        </nav>
      )}
      {open === "sort" && (
        <nav id={`${uid}-sort`} aria-label={t("store.sortBy")} className="mx-auto flex max-w-[1280px] flex-wrap gap-2 border-t border-[#E7E3D8] px-4 py-3 lg:justify-end lg:px-10">
          {SORTS.map((so) => (
            <Link key={so} href={href({ sort: so })} scroll={false} aria-current={so === sort ? "page" : undefined} className={chip(so === sort)} onClick={() => trackClient("store_sort_changed", { collection, value: so })}>
              {t(`store.sorts.${so}`)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
