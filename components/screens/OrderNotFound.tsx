import { t } from "@/lib/i18n";
import { SignOutButton } from "@/components/SignOutButton";

/** One generic message, the same whether or not the order exists (SPEC §7). */
export function OrderNotFound() {
  return (
    <div className="mx-auto max-w-md pt-6 text-center" data-testid="order-not-found">
      <h1 className="text-[24px] font-extrabold">{t("redeem.notFound")}</h1>
      <p className="mt-2 text-ink-2">{t("redeem.notFoundBody")}</p>
      <SignOutButton withIcon={false} label={t("redeem.switchAccount")} className="mt-6 h-12 rounded-[12px] bg-white px-6 font-bold text-pink-link shadow-sm" />
    </div>
  );
}
