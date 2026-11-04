import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { recipientFor, unsubscribeRecipient } from "@/lib/cards/unsubscribe";
import { TrackPageView } from "@/components/TrackPageView";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("unsubscribe.title"), robots: { index: false, follow: false }, referrer: "no-referrer" };

/** "Don't email me cards": blocks future card emails to this recipient. Needs a tap (link scanners don't unsubscribe people). */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string; done?: string }> }) {
  const { slug } = await params;
  const { d, done } = await searchParams;
  const r = d ? await recipientFor(slug, d) : null;
  async function confirm() {
    "use server";
    if (d) await unsubscribeRecipient(slug, d);
    redirect(`/c/${slug}/unsubscribe?d=${d}&done=1`);
  }
  return (
    <div className="mx-auto max-w-md pt-8 text-center" data-testid="unsubscribe">
      <TrackPageView event="page_view_card_unsubscribe" props={{ card_id: r?.cardPublicId ?? null }} />
      {!r ? (
        <h1 className="text-[24px] font-extrabold">{t("unsubscribe.invalid")}</h1>
      ) : done ? (
        <>
          <h1 className="text-[24px] font-extrabold">{t("unsubscribe.doneTitle")}</h1>
          <p className="mt-2 text-ink-2">{t("unsubscribe.doneBody")}</p>
        </>
      ) : (
        <form action={confirm}>
          <h1 className="text-[24px] font-extrabold">{t("unsubscribe.title")}</h1>
          <p className="mt-2 text-ink-2">{t("unsubscribe.body")}</p>
          <Button type="submit" size="lg" className="mt-6">
            {t("unsubscribe.confirm")}
          </Button>
        </form>
      )}
    </div>
  );
}
