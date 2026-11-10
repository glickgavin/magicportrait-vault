"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtBiz } from "@/lib/biztime";
import { useBizTz } from "./BizTime";

export type SourceStatus = { source: string; label: string; sub: string; ok: boolean | null; checkedAt: string | null; lastOkAt: string | null; ms: number | null; detail: Record<string, unknown> | null };

export function DataSourcesCard({ sources, full }: { sources: SourceStatus[]; full?: boolean }) {
  const tz = useBizTz();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function test(source: string) {
    setBusy(source);
    await fetch("/api/admin/data-sources/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
    setBusy(null);
    router.refresh();
  }
  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="ds-title" data-testid="data-sources">
      <div className="flex items-center justify-between">
        <h2 id="ds-title" className="text-[19px] font-extrabold">
          Data sources
        </h2>
        <button type="button" className="text-[14px] font-bold text-pink-link" disabled={Boolean(busy)} onClick={() => void test("all")}>
          {busy === "all" ? "Testing…" : "Test all"}
        </button>
      </div>
      <ul className={cn("mt-3 grid gap-3", full && "md:grid-cols-2")}>
        {sources.map((s) => (
          <li key={s.source} className={cn("flex items-start gap-3", full && "rounded-[14px] border border-line p-3")} data-testid={`source-${s.source}`}>
            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", s.ok === null ? "bg-black/25" : s.ok ? "bg-[#1f9a4a]" : "bg-[#d97a06]")} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">{s.label}</p>
              <p className="text-[13px] text-ink-2">{s.sub}</p>
              {full && s.detail && (
                <pre className="mt-1 overflow-x-auto rounded-[8px] bg-black/[0.04] p-2 text-[12px]">{JSON.stringify(s.detail, null, 1)}</pre>
              )}
              {full && (
                <p className="mt-1 text-[12px] text-ink-2">
                  {s.checkedAt ? `Checked ${fmtBiz(s.checkedAt, tz)}${s.ms ? ` · ${s.ms} ms` : ""}` : "Not tested yet"}
                  {s.lastOkAt ? ` · last success ${fmtBiz(s.lastOkAt, tz)}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={cn("text-[13px] font-bold", s.ok === null ? "text-ink-2" : s.ok ? "text-[#1f6b35]" : "text-[#8a4b00]")}>{s.ok === null ? "Not tested" : s.ok ? "OK" : "Check"}</span>
              {full && (
                <button type="button" onClick={() => void test(s.source)} disabled={Boolean(busy)} className="rounded-[8px] border border-line px-2 py-1 text-[13px] font-semibold">
                  {busy === s.source ? "Testing…" : "Test"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
