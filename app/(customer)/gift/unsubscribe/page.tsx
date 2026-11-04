import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { offerForUnsubscribe, unsubscribeFromOffers } from "@/lib/gift/offers";
import { TrackPageView } from "@/components/TrackPageView";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("offerUnsubscribe.title"), robots: { index: false, follow: false }, referrer: "no-referrer" };

/** "Don't email me offers" from the free gift offer email. Needs a tap (link scanners don't unsubscribe people). */
export default async function OfferUnsubscribePage({ searchParams }: { searchParams: Promise<{ o?: string; done?: string }> }) {
  const { o, done } = await searchParams;
  const offer = o ? await offerForUnsubscribe(o) : null;
  async function confirm() {
    "use server";
    if (o) await unsubscribeFromOffers(o);
    redirect(`/gift/unsubscribe?o=${o}&done=1`);
  }
  return (
    <div className="mx-auto max-w-md pt-8 text-center" data-testid="offer-unsubscribe">
      <TrackPageView event="page_view_offer_unsubscribe" props={{}} />
      {!offer ? (
        <h1 className="text-[24px] font-extrabold">{t("unsubscribe.invalid")}</h1>
      ) : done ? (
        <>
          <h1 className="text-[24px] font-extrabold">{t("offerUnsubscribe.doneTitle")}</h1>
          <p className="mt-2 text-ink-2">{t("offerUnsubscribe.doneBody")}</p>
        </>
      ) : (
        <form action={confirm}>
          <h1 className="text-[24px] font-extrabold">{t("offerUnsubscribe.title")}</h1>
          <p className="mt-2 text-ink-2">{t("offerUnsubscribe.body")}</p>
          <Button type="submit" size="lg" className="mt-6">
            {t("offerUnsubscribe.confirm")}
          </Button>
        </form>
      )}
    </div>
  );
}
