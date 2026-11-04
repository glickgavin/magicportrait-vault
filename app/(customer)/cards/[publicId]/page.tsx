import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOwnedCard } from "@/lib/db/cards";
import { ShareActions } from "@/components/builder/ShareActions";
import { LocalDateTime } from "@/components/LocalDateTime";
import { TrackPageView } from "@/components/TrackPageView";
import { TrackedLink } from "@/components/TrackedLink";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("builder.readyTitle") };

/** M5Ready: the card with share, download, copy link and app buttons. */
export default async function CardReadyPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const user = await requireUser(`/cards/${publicId}`);
  const card = await getOwnedCard(user.email, publicId);
  if (!card || !card.jpeg_path) notFound();
  const shareUrl = `${env.appUrl}/c/${card.share_slug}`;
  const imageUrl = `/api/cards/${card.id}/image`;
  return (
    <div className="mx-auto max-w-[460px]" data-testid="card-ready">
      <TrackPageView event="page_view_card_ready" props={{ card_id: card.public_id }} />
      {card.delivery === "email" && (
        <p className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[#e3f4e8] px-4 py-1.5 text-[15px] font-bold text-[#1f6b35]" data-ph-mask data-testid="delivery-status">
          {card.status === "scheduled" ? <Clock className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {card.status === "scheduled" && card.scheduled_for ? (
            <LocalDateTime iso={card.scheduled_for} prefix={t("builder.sendsAt", { date: "" })} />
          ) : card.status === "emailed" || card.status === "opened" ? (
            t("builder.emailedTo", { name: card.to_name })
          ) : (
            t("builder.queuedTo", { name: card.to_name })
          )}
        </p>
      )}
      <img src={imageUrl} alt={t("builder.cardAlt", { name: card.to_name })} width={1500} height={2100} className="ph-no-capture mx-auto mt-4 w-[78%] rounded-[8px] shadow-[0_12px_40px_rgba(0,0,0,0.18)]" />
      <h1 className="mt-5 text-center text-[26px] font-extrabold">{t("builder.readyTitle")}</h1>
      <div className="mt-4">
        <ShareActions cardId={card.id} publicId={card.public_id} shareUrl={shareUrl} toName={card.to_name} imageUrl={imageUrl} downloadUrl={`${imageUrl}?download=1`} />
      </div>
      <div className="mt-5 flex items-center justify-between rounded-[18px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <div>
          <p className="text-[17px] font-bold">{t("builder.makeAnother")}</p>
          <p className="text-[14px] text-ink-2">{t("builder.makeAnotherBody")}</p>
        </div>
        <TrackedLink href="/create?step=theme&entry=make_another" event="card_another_tapped" props={{}} className="rounded-[12px] bg-pink-tint px-4 py-2.5 font-bold text-pink-dark" testId="make-another">
          {t("builder.create")}
        </TrackedLink>
      </div>
      <Link href="/cards" className="link mx-auto mt-6 block w-fit text-[16px]">
        {t("builder.goToCards")}
      </Link>
    </div>
  );
}
