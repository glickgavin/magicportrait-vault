import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gift } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { findOwnedOrder } from "@/lib/redeem/access";
import { redeemConfig, viewOrder } from "@/lib/redeem/service";
import { fileName } from "@/lib/redeem/lock";
import { getSetting } from "@/lib/settings";
import { OrderNotFound } from "@/components/screens/OrderNotFound";
import { MugPicker } from "@/components/orders/MugPicker";
import { Downloads } from "@/components/orders/Downloads";
import { FulfillmentPill } from "@/components/orders/OrderChips";
import { TrackPageView } from "@/components/TrackPageView";
import { fmtDate } from "@/lib/format";
import { t, tn } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("orders.title") };

/** OrderDetail: the free mug and the downloads. Every action re-checks on the server. */
export default async function OrderPage({ params }: { params: Promise<{ orderName: string }> }) {
  const { orderName } = await params;
  const user = await requireUser(`/orders/${orderName}`);
  const order = await findOwnedOrder(user.email, decodeURIComponent(orderName));
  if (!order) return <OrderNotFound />;
  const [view, cfg, cardsEnabled] = await Promise.all([viewOrder(order), redeemConfig(), getSetting("cards.enabled")]);
  const { parsed } = view;
  const lockedText = view.lock.reason === "cancelled" ? t("orders.lockedCancelled") : view.lock.locked ? t("orders.locked") : null;
  const param = order.name.replace(/^#/, "");
  return (
    <div className="mx-auto max-w-[640px]" data-testid="order-detail">
      <TrackPageView event="page_view_vault_order" props={{ order_id: order.legacyId, mug_present: parsed.mug.present, downloads_enabled: view.downloadsEnabled }} />
      <div className="flex items-start gap-3">
        <Link href="/orders" aria-label={t("orders.back")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/[0.06]">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight">{t("orders.order", { name: order.name })}</h1>
          <p className="text-[14px] text-ink-2">
            {fmtDate(order.createdAt)} · {tn("orders.items", parsed.portraits.length)}
            {parsed.mug.present ? t("orders.withMug") : ""}
          </p>
        </div>
        <FulfillmentPill status={order.fulfillmentStatus} cancelled={Boolean(order.cancelledAt)} />
      </div>

      {parsed.mug.present && (
        <section className="mt-5 rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="mug-title">
          <div className="flex items-baseline justify-between">
            <h2 id="mug-title" className="text-[19px] font-extrabold">
              {t("orders.mugTitle")}
            </h2>
            {view.mugEditable && <span className="text-[13px] text-ink-2">{t("orders.mugHint")}</span>}
          </div>
          <MugPicker
            orderName={param}
            orderId={order.legacyId}
            portraits={view.mugPortraits.map((p) => ({ tileId: p.tileId, imageUrl: p.imageUrl }))}
            currentTileId={parsed.mug.currentTileId}
            editable={view.mugEditable}
            lockedText={lockedText}
          />
        </section>
      )}

      {view.downloadsEnabled && (
        <section className="mt-5 rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="dl-title">
          <div className="flex items-baseline justify-between">
            <h2 id="dl-title" className="text-[19px] font-extrabold">
              {t("orders.downloadsTitle")}
            </h2>
            <span className="text-[13px] text-ink-2">{t("orders.downloadsHint")}</span>
          </div>
          <Downloads
            orderName={param}
            orderId={order.legacyId}
            rows={parsed.portraits.map((p, i) => ({ tileId: p.tileId, imageUrl: p.imageUrl, fileName: fileName(cfg.s["redeem.file_name_template"], p.theme, cfg.s["redeem.file_default_theme"], i + 1, "jpg") }))}
          />
        </section>
      )}

      {!parsed.mug.present && !view.downloadsEnabled && <p className="mt-5 rounded-[20px] bg-white p-5 text-center text-ink-2">{t("orders.nothing")}</p>}

      {cardsEnabled && (
        <Link href="/create?entry=order_page" className="mt-5 flex items-center gap-4 rounded-[18px] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-pink-tint text-magenta" aria-hidden="true">
            <Gift className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-[16px] font-bold">{t("orders.createCard")}</span>
            <span className="block text-[14px] text-ink-2">{t("orders.createCardBody")}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
