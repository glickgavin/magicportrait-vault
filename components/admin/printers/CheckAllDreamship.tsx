"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { CheckAll, CheckRow } from "@/lib/dreamship/link";

type Saved = CheckAll & { products: number; fieldsChanged: number; linked: number; failed: number };

const STATUS: Record<CheckRow["status"], { text: string; tone: "green" | "amber" | "grey" | "red" }> = {
  up_to_date: { text: "UP TO DATE", tone: "green" },
  changes: { text: "DIFFERS FROM DREAMSHIP", tone: "amber" },
  unlinked_found: { text: "FOUND, NOT LINKED", tone: "amber" },
  not_found: { text: "NOT FOUND ON DREAMSHIP", tone: "grey" },
  error: { text: "COULDN'T CHECK", tone: "red" },
};
const FIELD: Record<string, string> = { maker: "Maker", maker_sku: "Maker SKU", print_px: "Print size (px)", extra: "Dreamship details", lead_days: "Making time" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "Check all Dreamship products": reads every product made by Dreamship (or published by Dreamship's Shopify app)
 * against Dreamship, then "Save all to Shopify" links the ones found and writes what differs. Nothing is written
 * until Save all is confirmed.
 */
export function CheckAllDreamship() {
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [data, setData] = useState<CheckAll | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "check" | "save") {
    setBusy(action);
    setError(null);
    setConfirm(false);
    if (action === "check") setSaved(null);
    const r = await fetch("/api/admin/printers/dreamship-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const body = r ? ((await r.json().catch(() => null)) as (Saved & { error?: string }) | null) : null;
    if (!r?.ok || !body) setError(body?.error ?? "Couldn't check. Try again.");
    else {
      setData(body);
      if (action === "save") setSaved(body);
      router.refresh();
    }
    setBusy(null);
  }

  const toSave = data ? data.rows.filter((r) => r.status === "changes" || r.status === "unlinked_found") : [];
  const fields = toSave.reduce((n, r) => n + r.fieldsChanged, 0);
  const links = toSave.filter((r) => r.status === "unlinked_found").length;

  return (
    <div className="mt-2" data-testid="dreamship-check-all">
      <p className="text-[13px] text-ink-2">
        Reads each product made by Dreamship from Dreamship (finding its Dreamship product when it isn&apos;t linked) and compares every size&apos;s print settings: maker, maker SKU, print size, Dreamship details and making time. Checking writes nothing. Run it after making a product or changing one in Dreamship: Dreamship&apos;s listing updates can rebuild a product&apos;s sizes in Shopify and drop these settings.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => run("check")} disabled={busy !== null} data-testid="dreamship-check-all-run">
          {busy === "check" ? "Checking every product…" : data ? "Check again" : "Check all Dreamship products"}
        </Button>
        {data && toSave.length > 0 && !confirm && (
          <Button type="button" size="sm" onClick={() => setConfirm(true)} disabled={busy !== null} data-testid="dreamship-save-all">
            Save all to Shopify
          </Button>
        )}
      </div>

      {confirm && (
        <div className="mt-3 rounded-[14px] bg-[#FFF4E5] p-3 text-[14px] text-[#7a4b00]" role="alertdialog" aria-labelledby="save-all-q" data-testid="dreamship-save-all-confirm">
          <p id="save-all-q" className="font-semibold">
            Write {plural(fields, "field")} on {plural(toSave.length, "product")}
            {links ? ` and link ${plural(links, "product")} to Dreamship` : ""}? Only what differs is changed; badges, prices and photos aren&apos;t touched.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={() => run("save")} disabled={busy !== null} data-testid="dreamship-save-all-yes">
              {busy === "save" ? "Saving…" : "Yes, save all"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-2 text-[14px]">
        {error && <p className="font-semibold text-[#a1251b]">{error}</p>}
        {saved && (
          <p className="font-semibold" data-testid="dreamship-save-all-result">
            Saved {plural(saved.fieldsChanged, "field")} on {plural(saved.products, "product")}
            {saved.linked ? `, linked ${saved.linked}` : ""}
            {saved.failed ? `; ${saved.failed} couldn't be saved (see below)` : ""}.
          </p>
        )}
        {data && !saved && (
          <p className="font-semibold">
            {plural(data.rows.length, "product")} checked: {data.counts.up_to_date} up to date, {data.counts.changes + data.counts.unlinked_found} to save
            {data.counts.not_found ? `, ${data.counts.not_found} not found` : ""}
            {data.counts.error ? `, ${data.counts.error} couldn't be checked` : ""}.
          </p>
        )}
      </div>

      {data && data.rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2" data-testid="dreamship-check-rows">
          {data.rows.map((r) => (
            <li key={r.legacyId} className="rounded-[14px] bg-black/[0.03] p-3 text-[14px]" data-status={r.status}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/settings/shop/products/${r.legacyId}?tab=print#dreamship`} className="min-w-[180px] flex-1 font-semibold hover:underline">
                  {r.title}
                </Link>
                {r.dreamshipProductId && <span className="text-ink-2">Dreamship {r.dreamshipProductId}</span>}
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
              </div>
              {r.error && <p className="mt-1 text-[13px] text-ink-2">{r.error}</p>}
              {r.sizes.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[13px] font-semibold">
                    {plural(r.fieldsChanged, "field")} on {plural(r.sizes.length, "size")}
                  </summary>
                  <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                    {r.sizes.map((s) => (
                      <li key={s.title}>
                        <span className="font-semibold">{s.title}:</span>{" "}
                        {s.changes.map((c) => `${FIELD[c.key] ?? c.key} ${c.from ? `${c.from} → ` : ""}${c.to}`).join("; ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {r.flags.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[13px] text-[#7a4b00]">
                  {r.flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
