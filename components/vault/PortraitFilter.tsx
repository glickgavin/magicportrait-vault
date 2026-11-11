"use client";

import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

export type Filter = "all" | "ordered" | "not_ordered";

/** `showAll`: every session is shown (Show more was tapped); changing the filter keeps that. */
export function PortraitFilter({ value, showAll = false }: { value: Filter; showAll?: boolean }) {
  const router = useRouter();
  const opts: [Filter, string][] = [
    ["all", t("portraits.filterAll")],
    ["ordered", t("portraits.filterOrdered")],
    ["not_ordered", t("portraits.filterNotOrdered")],
  ];
  return (
    <div role="radiogroup" aria-label={t("portraits.filterLabel")} className="flex gap-2">
      {opts.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => {
            if (key === value) return;
            trackClient("vault_filter_changed", { filter: key });
            const q = new URLSearchParams({ ...(key !== "all" ? { filter: key } : {}), ...(showAll ? { all: "1" } : {}) }).toString();
            router.replace(q ? `/portraits?${q}` : "/portraits", { scroll: false });
          }}
          className={cn("h-11 rounded-[12px] px-4 text-[15px] font-semibold", value === key ? "bg-primary-gradient text-white shadow-primary" : "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
