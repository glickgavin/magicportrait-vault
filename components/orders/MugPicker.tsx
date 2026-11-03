"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

type P = { tileId: string; imageUrl: string };

/** The free-mug photo picker: a real radio group, saved through the server (which re-checks everything). */
export function MugPicker({ orderName, orderId, portraits, currentTileId, editable, lockedText }: { orderName: string; orderId: string; portraits: P[]; currentTileId: string | null; editable: boolean; lockedText: string | null }) {
  const [saved, setSaved] = useState(currentTileId);
  const [selected, setSelected] = useState(currentTileId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    trackClient("redeem_mug_section_viewed", { order_id: orderId, portrait_count: portraits.length, mug_already_chosen: Boolean(currentTileId) });
    if (lockedText) trackClient("redeem_mug_locked_viewed", { order_id: orderId });
  }, [orderId, portraits.length, currentTileId, lockedText]);

  async function save() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    trackClient("redeem_mug_save_clicked", { order_id: orderId, tile_id: selected, is_first_save: !saved });
    const r = await fetch(`/api/orders/${encodeURIComponent(orderName)}/mug`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tileId: selected }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setSaved(selected);
      setMsg({ ok: true, text: t("orders.saved") });
    } else setMsg({ ok: false, text: r?.status === 409 ? t("orders.locked") : t("orders.saveFailed") });
  }

  const savedIndex = portraits.findIndex((p) => p.tileId === saved);
  const shown = editable ? portraits : portraits.filter((p) => p.tileId === saved);
  return (
    <div data-testid="mug-section">
      <div className="flex items-center gap-4 py-3">
        <div className="relative h-[84px] w-[84px] shrink-0 rounded-[14px] border border-line bg-white p-2 shadow-sm" aria-hidden="true">
          {saved && portraits[savedIndex] ? <img src={portraits[savedIndex].imageUrl} alt="" className="h-full w-full rounded-[8px] object-cover" /> : <div className="h-full w-full rounded-[8px] bg-black/5" />}
          <span className="absolute -right-4 top-4 h-12 w-6 rounded-r-full border-4 border-l-0 border-white/90" />
        </div>
        <div>
          <p className="text-[16px] font-bold">{saved && savedIndex >= 0 ? t("orders.mugOnMug", { n: savedIndex + 1 }) : saved ? t("orders.mugConfirmTitle") : t("orders.mugPickTitle")}</p>
          <p className="text-[14px] text-ink-2">{lockedText ?? (editable ? t("orders.mugBody") : t("orders.readOnly"))}</p>
        </div>
      </div>
      {shown.length > 0 && (
        <div role="radiogroup" aria-label={t("orders.mugPickerLabel")} aria-disabled={!editable} className="grid grid-cols-3 gap-2">
          {shown.map((p) => {
            const n = portraits.indexOf(p) + 1;
            const on = selected === p.tileId;
            return (
              <button
                key={p.tileId}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t("orders.mugPortrait", { n })}
                disabled={!editable}
                onClick={() => {
                  if (!editable || on) return;
                  trackClient("redeem_mug_tile_selected", { order_id: orderId, tile_id: p.tileId, previous_tile_id: selected, is_change: Boolean(saved), portrait_index: n - 1 });
                  setSelected(p.tileId);
                  setMsg(null);
                }}
                className={cn("relative aspect-square overflow-hidden rounded-[14px] bg-black/5", on && "ring-[3px] ring-magenta", !editable && "cursor-default")}
              >
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                {on && (
                  <span className="bg-avatar-gradient absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white" aria-hidden="true">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {editable && (
        <Button size="lg" className="mt-4 w-full" disabled={!selected || busy || selected === saved} onClick={() => void save()} data-testid="save-mug">
          {busy ? t("orders.saving") : t("orders.save")}
        </Button>
      )}
      <p role="status" aria-live="polite" className={cn("mt-2 min-h-[1.25rem] text-[15px] font-semibold", msg?.ok ? "text-success" : "text-danger")}>
        {msg?.text}
      </p>
    </div>
  );
}
