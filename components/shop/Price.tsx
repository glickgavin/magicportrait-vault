import { formatMoney } from "@/lib/shop/money";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "from $49.00 [$24.50]": the full price struck through beside the customer's price, when a discount applies. */
export function Price({ price, discounted, currency, from, size = "sm", className }: { price: string; discounted: string | null; currency: string; from?: boolean; size?: "sm" | "lg"; className?: string }) {
  const big = size === "lg";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", big ? "text-[16px]" : "text-[13px]", className)}>
      {from && <span className="text-ink-2">{t("shop.from")}</span>}
      {discounted ? (
        <>
          <s className="text-ink-2">{formatMoney(price, currency)}</s>
          <span className={cn("font-extrabold text-pink-dark", big ? "text-[20px]" : "text-[15px]")}>{formatMoney(discounted, currency)}</span>
        </>
      ) : (
        <span className={cn("font-extrabold text-ink", big ? "text-[20px]" : "text-[15px]")}>{formatMoney(price, currency)}</span>
      )}
    </span>
  );
}
