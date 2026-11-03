import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Coffee } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getSources } from "@/lib/sources";
import { viewOrder } from "@/lib/redeem/service";
import { SignOutButton } from "@/components/SignOutButton";
import { TrackPageView } from "@/components/TrackPageView";
import { OrderChips, FulfillmentPill } from "@/components/orders/OrderChips";
import { fmtDate } from "@/lib/format";
import { t, tn } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("orders.title") };

const nameParam = (name: string) => name.replace(/^#/, "");

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const { shopify } = await getSources();
  const orders = await shopify.ordersByEmail(user.email).catch(() => []);
  const views = await Promise.all(orders.map((o) => viewOrder(o)));
  const pending = views.filter((v) => v.chips.mugChoose);
  return (
    <div className="mx-auto max-w-[640px]" data-testid="orders">
      <TrackPageView event="page_view_vault_orders" props={{ orders_count: views.length, mug_pending_count: pending.length }} />
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{t("orders.title")}</h1>
      <p className="text-[15px] text-ink-2">{t("orders.sub", { email: user.email })}</p>
      {pending[0] && (
        <Link href={`/orders/${nameParam(pending[0].order.name)}`} className="mt-4 flex items-center gap-3 rounded-[18px] bg-primary-gradient p-4 text-white shadow-primary" data-testid="mug-banner">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white/25" aria-hidden="true">
            <Coffee className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-bold">{t("orders.mugBanner")}</span>
            <span className="block text-[14px] text-white/90">{t("orders.mugBannerSub", { name: pending[0].order.name })}</span>
          </span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      )}
      {views.length === 0 && <p className="mt-6 rounded-[16px] bg-white p-5 text-center text-ink-2">{t("orders.none")}</p>}
      <ul className="mt-4 flex flex-col gap-4">
        {views.map((v) => (
          <li key={v.order.id}>
            <Link href={`/orders/${nameParam(v.order.name)}`} className="block rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="order-row">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[18px] font-bold">{t("orders.order", { name: v.order.name })}</h2>
                  <p className="text-[14px] text-ink-2">
                    {fmtDate(v.order.createdAt)} · {tn("orders.items", v.parsed.portraits.length)}
                    {v.parsed.mug.present ? t("orders.withMug") : ""}
                  </p>
                </div>
                <FulfillmentPill status={v.order.fulfillmentStatus} cancelled={v.chips.cancelled} />
              </div>
              {v.parsed.portraits.length > 0 && (
                <div className="mt-3 flex gap-2" aria-hidden="true">
                  {v.mugPortraits.slice(0, 5).map((p) => (
                    <img key={p.tileId} src={p.imageUrl} alt="" className="h-14 w-14 rounded-[10px] object-cover" loading="lazy" />
                  ))}
                </div>
              )}
              <OrderChips chips={v.chips} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-[14px] text-ink-2">
        {t("orders.missing")} <SignOutButton withIcon={false} label={t("orders.switchAccount")} className="link inline" />
      </p>
    </div>
  );
}
