import type { OrderView } from "@/lib/redeem/service";
import { t, tn, hasKey } from "@/lib/i18n";

export function OrderChips({ chips }: { chips: OrderView["chips"] }) {
  if (!chips.mugChoose && !chips.downloads && !chips.mugPrinted) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.mugChoose && <span className="rounded-full bg-pink-tint px-3 py-1 text-[13px] font-bold text-pink-dark">{t("orders.chipMug")}</span>}
      {chips.downloads > 0 && <span className="rounded-full bg-[#e3f4e8] px-3 py-1 text-[13px] font-bold text-[#1f6b35]">{tn("orders.chipDownloads", chips.downloads)}</span>}
      {chips.mugPrinted && <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[13px] font-bold">{t("orders.chipPrinted")}</span>}
    </div>
  );
}

export function FulfillmentPill({ status, cancelled }: { status: string | null; cancelled: boolean }) {
  const key = `orders.fulfillment.${status ?? "UNFULFILLED"}`;
  const label = cancelled ? t("orders.cancelled") : hasKey(key) ? t(key) : t("orders.fulfillment.UNFULFILLED");
  const delivered = status === "FULFILLED" && !cancelled;
  return <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-bold ${delivered ? "bg-[#e3f4e8] text-[#1f6b35]" : cancelled ? "bg-black/[0.06] text-ink-2" : "bg-pink-tint text-pink-dark"}`}>{label}</span>;
}
