"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { isShown } from "@/lib/render/layout";
import { Button } from "@/components/ui/Button";
import { StepHeader, StickyFooterBar } from "./StepHeader";
import { useDraft } from "./useDraft";
import type { BuilderData, ClientVersion } from "./types";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

export function ThemeStep({ data, category, entryPoint }: { data: BuilderData; category: string | null; entryPoint: string | null }) {
  const router = useRouter();
  const { draft, update, ready } = useDraft((d) => ({
    ...d,
    flow: "full",
    entryPoint: entryPoint ?? d.entryPoint,
    versionId: d.versionId && data.versions.some((v) => v.id === d.versionId) ? d.versionId : data.defaults.versionId,
    imageId: data.defaults.imageId ?? d.imageId,
  }));
  const selected = data.versions.find((v) => v.id === draft.versionId) ?? null;
  const active = category && data.categories.some((c) => c.slug === category) ? category : "all";

  useEffect(() => {
    trackClient("page_view_card_theme", { categories_shown: data.categories.map((c) => c.slug).join(","), entry_point: entryPoint });
  }, [data.categories, entryPoint]);

  const tabs = useMemo(() => [{ slug: "all", name: t("builder.all"), count: data.versions.length }, ...data.categories], [data]);

  function pickCategory(slug: string, via: "tab" | "see_all") {
    trackClient("card_category_selected", { category: slug, via });
    router.replace(slug === "all" ? "/create?step=theme" : `/create?step=theme&category=${slug}`, { scroll: false });
  }
  function pick(v: ClientVersion, position: number) {
    update({ versionId: v.id, messageTouched: draft.versionId === v.id ? draft.messageTouched : false });
    trackClient("card_theme_selected", { theme_slug: v.fullSlug, version_slug: v.versionSlug, category: v.categorySlug, position, is_new: v.isNew, in_season: v.inSeason });
  }

  return (
    <div className="mx-auto max-w-[960px] pb-28" data-testid="step-theme">
      <StepHeader step={1} onBack={() => router.push("/")} />
      <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">{t("builder.occasion")}</h1>
      <div role="tablist" aria-label={t("builder.categoriesLabel")} className="no-scrollbar -mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((c) => (
          <button
            key={c.slug}
            role="tab"
            type="button"
            aria-selected={active === c.slug}
            onClick={() => pickCategory(c.slug, "tab")}
            className={cn(
              "h-12 shrink-0 snap-start rounded-[14px] px-4 text-[16px] font-semibold",
              active === c.slug ? "bg-primary-gradient text-white shadow-primary" : "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
            )}
          >
            {c.name} <span className={active === c.slug ? "text-white/90" : "text-ink-2"}>{c.count}</span>
          </button>
        ))}
      </div>

      {ready && active === "all" && (
        <div className="mt-2">
          {data.categories.map((c) => {
            const list = data.versions.filter((v) => v.categorySlug === c.slug);
            return (
              <section key={c.slug} className="mt-5" aria-labelledby={`cat-${c.slug}`}>
                <div className="flex items-center justify-between">
                  <h2 id={`cat-${c.slug}`} className="flex items-center gap-2 text-[19px] font-extrabold">
                    {c.name}
                    {c.inSeason && <span className="rounded-full bg-[#e3f4e8] px-2 py-0.5 text-[12px] font-bold text-[#1f6b35]">{t("builder.inSeason")}</span>}
                  </h2>
                  <button type="button" className="link text-[15px]" onClick={() => pickCategory(c.slug, "see_all")}>
                    {t("builder.seeAll", { count: list.length })}
                  </button>
                </div>
                <div role="radiogroup" aria-label={t("builder.designsLabel", { category: c.name })} className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                  {list.map((v) => (
                    <Tile key={v.id} v={v} selected={v.id === draft.versionId} onPick={() => pick(v, data.versions.indexOf(v))} className="w-[46%] max-w-[220px] shrink-0 snap-start" />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {ready && active !== "all" && (
        <div role="radiogroup" aria-label={t("builder.designsLabel", { category: tabs.find((x) => x.slug === active)?.name ?? "" })} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.versions
            .filter((v) => v.categorySlug === active)
            .map((v) => (
              <Tile key={v.id} v={v} selected={v.id === draft.versionId} onPick={() => pick(v, data.versions.indexOf(v))} />
            ))}
        </div>
      )}

      <StickyFooterBar label={t("builder.selected")} value={selected ? `${selected.themeName} · ${selected.name}` : t("builder.nothingSelected")}>
        <Button size="lg" disabled={!selected} onClick={() => router.push(isShown(selected!.layout.photo) ? `/create/portrait?v=${selected!.id}` : `/create/message?v=${selected!.id}`)} data-testid="next">
          {t("builder.next")}
        </Button>
      </StickyFooterBar>
    </div>
  );
}

function Tile({ v, selected, onPick, className }: { v: ClientVersion; selected: boolean; onPick: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${v.themeName} · ${v.name}${v.isNew ? `, ${t("builder.new")}` : ""}`}
      onClick={onPick}
      className={cn("relative rounded-[18px] bg-white p-2 text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)]", selected && "ring-[3px] ring-magenta", className)}
    >
      <img src={v.thumbnailUrl ?? v.backgroundUrl} alt="" width={300} height={420} loading="lazy" className="aspect-[5/7] w-full rounded-[8px] object-cover" />
      {selected && (
        <span className="bg-avatar-gradient absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-white shadow" aria-hidden="true">
          <Check className="h-4 w-4" />
        </span>
      )}
      <span className="mt-2 flex items-center justify-between gap-2 px-1">
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold">{v.name}</span>
          <span className="block truncate text-[13px] text-ink-2">{v.themeName}</span>
        </span>
        {v.isNew && <span className="rounded-full bg-pink-tint px-2 py-0.5 text-[11px] font-extrabold text-pink-dark">{t("builder.new")}</span>}
      </span>
    </button>
  );
}
