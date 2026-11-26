"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { DreamshipCard as Card } from "@/lib/dreamship/link";
import type { SyncReport } from "@/lib/dreamship/sync";
import { Button } from "@/components/ui/Button";

const usd = (n: number | null) => (n == null ? "–" : `$${n.toFixed(2)}`);

/**
 * A Settings › Shop product's Dreamship card (docs/dreamship.md › Part A): link it, Sync from Dreamship to see what
 * differs, and Save to Shopify to write only that. Cost, margin and dpi are shown, never written.
 */
export function DreamshipCard({ initial, productId }: { initial: Card; productId: string }) {
  const router = useRouter();
  const uid = useId();
  const [card, setCard] = useState(initial);
  const [value, setValue] = useState(initial.suggestion ? String(initial.suggestion) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);

  async function call(action: "link" | "sync" | "save") {
    setBusy(action);
    setMsg(null);
    const body = action === "link" ? { action, productId, dreamship: value } : { action, productId };
    const r = await fetch("/api/admin/shop/dreamship", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const res = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; card?: Card; result?: { report?: SyncReport; fieldsChanged?: number } } | null;
    setBusy(null);
    if (!r?.ok || !res?.ok) {
      setMsg({ ok: false, text: res?.error ?? "Something went wrong. Try again." });
      return;
    }
    if (res.card) setCard(res.card);
    if (action === "link") setMsg({ ok: true, text: "Linked to the Dreamship product." });
    if (action === "sync") setReport(res.result?.report ?? null);
    if (action === "save") {
      setMsg({ ok: true, text: res.result?.fieldsChanged ? `Saved ${res.result.fieldsChanged} ${res.result.fieldsChanged === 1 ? "field" : "fields"} to Shopify.` : "Nothing to save: Shopify already matches Dreamship." });
      setReport(null);
      router.refresh();
    }
  }

  const shown = report ?? card.report;
  return (
    <div className="flex flex-col gap-3" data-testid="dreamship-card">
      {!card.linkedId ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call("link");
          }}
        >
          <label htmlFor={`${uid}-id`} className="text-[15px] font-semibold">
            Dreamship product id or designer link
          </label>
          {card.suggestion && (
            <p className="text-[13px] text-ink-2" data-testid="dreamship-suggestion">
              Found on Dreamship: {card.suggestion} (listed on this product, or its sizes&apos; SKUs are that product&apos;s variants). Link it, then Sync from Dreamship.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input id={`${uid}-id`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="9972256 or https://app.dreamship.com/app/products/…" className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-2 text-[14px]" />
            <Button type="submit" size="sm" disabled={busy !== null || !value.trim()}>
              {busy === "link" ? "Linking…" : "Link"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[15px]">
            Linked to Dreamship product{" "}
            <a href={card.designer ?? "#"} target="_blank" rel="noreferrer" className="link font-bold">
              {card.linkedId}
            </a>
          </p>
          <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => void call("sync")}>
            {busy === "sync" ? "Reading Dreamship…" : "Sync from Dreamship"}
          </Button>
          {card.lastSync && <span className="text-[13px] text-ink-2">Last synced {new Date(card.lastSync.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>}
        </div>
      )}
      {card.error && <p className="text-[14px] text-[#a1251b]">{card.error}</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[14px] font-semibold text-[#1f6b35]" : "text-[14px] font-semibold text-[#a1251b]"}>
          {msg.text}
        </p>
      )}

      {shown && card.linkedId && (
        <div className="flex flex-col gap-3">
          {shown.flags.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-[14px] bg-[#FFF4E5] p-3 text-[14px] text-[#7a4b00]" data-testid="dreamship-flags">
              {shown.flags.map((f, i) => (
                <li key={i}>{f.text}</li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Dreamship sizes">
            <table className="w-full min-w-[720px] text-[13px]" data-testid="dreamship-sizes">
              <thead>
                <tr className="text-left text-ink-2">
                  <th className="py-1 font-semibold">Size</th>
                  <th className="py-1 font-semibold">Dreamship variant</th>
                  <th className="py-1 text-right font-semibold">Cost</th>
                  <th className="py-1 text-right font-semibold">Price</th>
                  <th className="py-1 text-right font-semibold">Margin</th>
                  <th className="py-1 text-right font-semibold">At {card.salePct}% off</th>
                  <th className="py-1 text-right font-semibold">dpi (min)</th>
                  <th className="py-1 font-semibold">AI upscale</th>
                  <th className="py-1 font-semibold">Differs from Dreamship</th>
                </tr>
              </thead>
              <tbody>
                {shown.sizes.map((s) => (
                  <tr key={s.variantId} className="border-t border-black/[0.06] align-top">
                    <td className="py-1.5 pr-2 font-semibold">{s.title}</td>
                    <td className="py-1.5 pr-2">{s.dreamshipVariantId ?? "None"}</td>
                    <td className="py-1.5 text-right">{usd(s.cost)}</td>
                    <td className="py-1.5 text-right">{usd(s.price)}</td>
                    <td className="py-1.5 text-right">{s.marginPct == null ? "–" : `${s.marginPct}%`}</td>
                    <td className={`py-1.5 text-right ${s.saleProfit != null && s.saleProfit < 0 ? "font-bold text-[#a1251b]" : ""}`}>{usd(s.saleProfit)}</td>
                    <td className={`py-1.5 text-right ${s.dpi != null && s.minDpi != null && s.dpi < s.minDpi ? "font-bold text-[#a1251b]" : ""}`}>{s.dpi == null ? "–" : s.dpi}{s.minDpi != null ? ` (${s.minDpi})` : ""}</td>
                    <td className="py-1.5 pl-2">{s.aiUpscale == null ? "–" : s.aiUpscale ? "On" : "Off"}</td>
                    <td className="py-1.5 pl-2">
                      {s.changes.length ? (
                        <ul className="flex flex-col gap-0.5">
                          {s.changes.map((c) => (
                            <li key={c.key}>
                              <code>{c.key}</code>: {c.from ?? "not set"} → <strong>{c.to}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : s.dreamshipVariantId ? (
                        "Matches"
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" disabled={busy !== null || report.fieldsChanged === 0} onClick={() => void call("save")}>
                {busy === "save" ? "Saving…" : report.fieldsChanged ? `Save to Shopify (${report.fieldsChanged} ${report.fieldsChanged === 1 ? "field" : "fields"})` : "Shopify matches Dreamship"}
              </Button>
              <span className="text-[13px] text-ink-2">Writes only the fields that differ, to these sizes&apos; print rules.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
