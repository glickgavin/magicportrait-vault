"use client";

import { useState } from "react";
import type { TimelineItem } from "@/lib/admin/customers";
import { cn } from "@/lib/utils";
import { fmtBiz } from "@/lib/biztime";
import { useBizTz } from "./BizTime";

const CHIPS = [
  ["all", "All"],
  ["vault", "My MP"],
  ["shopify", "Shopify"],
  ["imagen", "Imagen"],
  ["email", "Email"],
] as const;
const TONE: Record<string, string> = { vault: "bg-pink-tint text-pink-dark", shopify: "bg-[#e3f4e8] text-[#1f6b35]", imagen: "bg-[#e5ecf8] text-[#23427a]", email: "bg-[#fff1d6] text-[#7a4a00]" };

export function CustomerTimeline({ items }: { items: TimelineItem[] }) {
  const tz = useBizTz();
  const [f, setF] = useState<string>("all");
  const shown = items.filter((i) => f === "all" || i.source === f);
  return (
    <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="tl-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tl-title" className="text-[19px] font-extrabold">
          Timeline
        </h2>
        <div role="radiogroup" aria-label="Filter the timeline" className="flex gap-1">
          {CHIPS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f === k} onClick={() => setF(k)} className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", f === k ? "bg-[#2b2b2b] text-white" : "bg-black/[0.05]")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-3 flex flex-col" data-testid="timeline">
        {shown.map((i, n) => (
          <li key={n} className="flex gap-3 border-b border-line py-2 text-[14px]" data-source={i.source}>
            <time className="w-[130px] shrink-0 text-[12px] text-ink-2" dateTime={i.at}>
              {fmtBiz(i.at, tz)}
            </time>
            <span className={cn("h-fit shrink-0 rounded-full px-2 text-[11px] font-bold", TONE[i.source])}>{CHIPS.find((c) => c[0] === i.source)?.[1]}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{i.title}</span>
              {i.detail && <span className="block truncate text-[12px] text-ink-2">{i.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
