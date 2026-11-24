"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Rules = { maker: string; maker_sku: string; print_px: string; placement: string; zone_px: string; min_short_side_px: string; max_crop_pct: string; adjustable: string; image_kinds: string };
type Size = { id: string; title: string; sku: string | null; availableForSale: boolean; rules: Rules; status: string };

const input = "h-10 w-full min-w-0 rounded-[10px] border border-line bg-white px-3 text-[15px]";
const PX = /^(\d{2,5}x\d{2,5})?$/i;

/** One row of rules per size; Save writes only what changed. */
export function ShopRulesEditor({ productId, sizes, defaults }: { productId: string; sizes: Size[]; defaults: { minShortSidePx: number; maxCropPct: number } }) {
  const router = useRouter();
  const uid = useId();
  const [rows, setRows] = useState<Record<string, Rules>>(() => Object.fromEntries(sizes.map((s) => [s.id, s.rules])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = useMemo(() => sizes.some((s) => JSON.stringify(rows[s.id]) !== JSON.stringify(s.rules)), [rows, sizes]);
  const set = (id: string, k: keyof Rules, v: string) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  const problems = sizes.flatMap((s) => {
    const r = rows[s.id];
    const out: string[] = [];
    if (!PX.test(r.print_px.trim())) out.push(`${s.title}: print area must be width x height, e.g. 2400x3000`);
    if (!PX.test(r.zone_px.trim())) out.push(`${s.title}: picture zone must be width x height`);
    if (/\s/.test(r.maker_sku.trim())) out.push(`${s.title}: the maker's code has no spaces`);
    return out;
  });
  // Copy the first size's maker and options to every size (codes and print areas differ per size).
  const copyFirst = () => {
    const f = rows[sizes[0].id];
    setRows((r) => Object.fromEntries(sizes.map((s, i) => [s.id, i === 0 ? r[s.id] : { ...r[s.id], maker: f.maker, placement: f.placement, min_short_side_px: f.min_short_side_px, max_crop_pct: f.max_crop_pct, adjustable: f.adjustable, image_kinds: f.image_kinds }])));
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    const variants = sizes.map((s) => ({ variantId: s.id, rules: Object.fromEntries(Object.entries(rows[s.id]).map(([k, v]) => [k, v.trim()])) }));
    const r = await fetch("/api/admin/shop/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, variants }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (r?.ok) {
      setMsg({ ok: true, text: "Saved to Shopify." });
      router.refresh();
    } else setMsg({ ok: false, text: b?.error ?? "Couldn't save" });
  }

  return (
    <div className="flex flex-col gap-4">
      {sizes.map((s) => {
        const r = rows[s.id];
        const id = (k: string) => `${uid}-${s.id}-${k}`;
        const field = (k: keyof Rules, label: string, el: React.ReactNode, hint?: string) => (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={id(k)} className="text-[13px] font-bold">
              {label}
            </label>
            {el}
            {hint && <span className="text-[12px] text-ink-2">{hint}</span>}
          </div>
        );
        return (
          <section key={s.id} aria-label={`Size ${s.title}`} className="rounded-[16px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="rules-size">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-extrabold">{s.title}</h2>
              {s.sku && <span className="text-[13px] text-ink-2">Shopify SKU {s.sku}</span>}
              <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-extrabold tracking-wide", s.status === "ready" ? "bg-[#e3f4e6] text-[#1f6b35]" : "bg-[#fff1d6] text-[#7a4a00]")}>{s.status === "ready" ? "READY" : s.status.toUpperCase()}</span>
              {!s.availableForSale && <span className="text-[13px] text-ink-2">Not for sale in Shopify</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {field(
                "maker",
                "Maker",
                <select id={id("maker")} value={r.maker} onChange={(e) => set(s.id, "maker", e.target.value)} className={input}>
                  <option value="">Not set</option>
                  <option value="prodigi">Prodigi</option>
                  <option value="gelato">Gelato</option>
                  <option value="dreamship">Dreamship</option>
                  <option value="in_house">In house</option>
                </select>,
              )}
              {field("maker_sku", "Maker's product code", <input id={id("maker_sku")} value={r.maker_sku} onChange={(e) => set(s.id, "maker_sku", e.target.value)} className={input} spellCheck={false} autoComplete="off" />, "e.g. a Prodigi SKU, a Gelato product uid or a Dreamship item variant id")}
              {field("print_px", "Print area (px)", <input id={id("print_px")} value={r.print_px} onChange={(e) => set(s.id, "print_px", e.target.value)} className={input} placeholder="2400x3000" inputMode="text" spellCheck={false} />, "width x height")}
              {field(
                "placement",
                "Placement",
                <select id={id("placement")} value={r.placement} onChange={(e) => set(s.id, "placement", e.target.value)} className={input}>
                  <option value="">Cover (default): fill and crop</option>
                  <option value="cover">Cover: fill and crop</option>
                  <option value="contain">Contain: fit on a background</option>
                  <option value="wrap_zone">Wrap zone: one side of a mug</option>
                </select>,
              )}
              {(r.placement === "wrap_zone" || r.zone_px) && field("zone_px", "Picture zone (px)", <input id={id("zone_px")} value={r.zone_px} onChange={(e) => set(s.id, "zone_px", e.target.value)} className={input} placeholder="1155x1155" spellCheck={false} />, "the part of the print area the picture fills")}
              {field("min_short_side_px", "Smallest picture (px)", <input id={id("min_short_side_px")} value={r.min_short_side_px} onChange={(e) => set(s.id, "min_short_side_px", e.target.value)} className={input} inputMode="numeric" placeholder={`${defaults.minShortSidePx} (default)`} />, "short side, at least")}
              {field("max_crop_pct", "Most it may crop (%)", <input id={id("max_crop_pct")} value={r.max_crop_pct} onChange={(e) => set(s.id, "max_crop_pct", e.target.value)} className={input} inputMode="numeric" placeholder={`${defaults.maxCropPct} (default)`} />, "hidden for pictures that would lose more")}
              {field(
                "adjustable",
                "Customers can adjust",
                <select id={id("adjustable")} value={r.adjustable} onChange={(e) => set(s.id, "adjustable", e.target.value)} className={input}>
                  <option value="">Yes (default)</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>,
              )}
              {field(
                "image_kinds",
                "Which pictures",
                <select id={id("image_kinds")} value={r.image_kinds} onChange={(e) => set(s.id, "image_kinds", e.target.value)} className={input}>
                  <option value="">Portraits and photos (default)</option>
                  <option value="both">Portraits and photos</option>
                  <option value="portraits">Portraits only</option>
                  <option value="photos">Photos only</option>
                </select>,
              )}
            </div>
          </section>
        );
      })}
      {problems.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-[14px] font-bold text-[#a1251b]">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty || busy || problems.length > 0} onClick={() => void save()}>
          {busy ? "Saving…" : "Save to Shopify"}
        </Button>
        {sizes.length > 1 && (
          <button type="button" className="text-[14px] font-bold text-pink-link" onClick={copyFirst}>
            Copy maker and options from {sizes[0].title} to every size
          </button>
        )}
        {dirty && (
          <button type="button" className="text-[14px] font-bold text-pink-link" onClick={() => setRows(Object.fromEntries(sizes.map((s) => [s.id, s.rules])))}>
            Undo changes
          </button>
        )}
        {msg && (
          <span role="status" className={cn("text-[14px] font-bold", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
