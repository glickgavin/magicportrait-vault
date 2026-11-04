import { Image as ImageIcon, Package, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { CardPreview } from "@/components/CardPreview";
import { RowLink } from "@/components/vault/RowLink";
import { TrackPageView } from "@/components/TrackPageView";
import type { HomeData } from "@/lib/vault/home";
import { usableIdeas } from "@/lib/render/layout";
import { t, tn } from "@/lib/i18n";

/** First time: one big "Make my card", portraits, orders. Nothing else (SPEC §8.0). */
export function FirstHome({ data, footerText }: { data: HomeData; footerText: string }) {
  const { profile, firstVersion, firstPortrait } = data;
  const idea = firstVersion ? (usableIdeas(firstVersion.messageIdeas, data.firstPetName)[0] ?? "") : "";
  return (
    <div className="mx-auto max-w-[480px]" data-testid="home-first">
      <TrackPageView event="page_view_vault_home_first" props={{ mug_pending: data.mugPending > 0 }} />
      <p className="text-center text-[17px] text-ink-2">{profile.firstName ? t("home.hiShort", { name: profile.firstName }) : t("home.hiShortAnon")}</p>
      {data.access.allowed ? (
        <section className="mt-4 rounded-[24px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.05)]" aria-labelledby="first-card-title">
          <div className="relative overflow-hidden rounded-[18px] bg-[#F6E3F2] px-10 pb-5 pt-12">
            <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[13px] font-bold text-pink-dark">{t("home.freeGiftBadge")}</span>
            {firstVersion && (
              <div className="mx-auto w-[66%] rotate-[3deg]">
                <CardPreview
                  layout={firstVersion.layout}
                  backgroundUrl={firstVersion.backgroundUrl}
                  overlayUrl={firstVersion.overlayUrl}
                  portraitUrl={firstPortrait?.imageUrl}
                  photoBg={firstVersion.photoBg}
                  to={t("home.theirName")}
                  from={profile.firstName ?? ""}
                  message={idea}
                  footerText={footerText}
                  label={`${firstVersion.themeName} · ${firstVersion.name}`}
                  maxWidth={260}
                  priority
                />
              </div>
            )}
          </div>
          <div className="px-3 pb-3 pt-5 text-center">
            <h1 id="first-card-title" className="text-[26px] font-extrabold leading-tight tracking-tight">
              {t("home.firstPanelTitle")}
            </h1>
            <p className="mt-2 text-[16px] text-ink-2">{t("home.firstPanelBody")}</p>
            <ButtonLink href="/create?entry=home" size="lg" className="mt-5 w-full" data-testid="make-my-card">
              {t("home.makeMyCard")} <Sparkles className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      ) : (
        <CardsBlocked data={data} />
      )}
      <div className="mt-4 flex flex-col gap-3">
        <RowLink href="/portraits" icon={<ImageIcon className="h-5 w-5" />} title={t("home.myPortraits")} sub={tn("home.portraitsCount", profile.portraitCount)} action={t("home.seeAll")} testId="portraits-see-all" />
        <RowLink
          href="/orders"
          icon={<Package className="h-5 w-5" />}
          title={t("home.ordersTitle")}
          sub={data.mugPending ? t("home.chooseMug") : t("home.ordersBody")}
          subTone={data.mugPending ? "pink" : "muted"}
          testId="orders-row"
        />
      </div>
    </div>
  );
}

export function CardsBlocked({ data }: { data: HomeData }) {
  // Paused or locked: entry points are simply hidden on home (the builder explains "Cards are paused").
  if (data.access.allowed || data.access.reason !== "limit") return null;
  const limit = true;
  return (
    <section className="mt-4 rounded-[20px] bg-white p-5 text-center shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="cards-blocked">
      <h1 className="text-[22px] font-extrabold">{limit ? t("home.cardsTitle") : t("home.cardsPaused")}</h1>
      <p className="mt-2 text-ink-2">
        {limit ? t("home.cardsLimit", { date: new Date(data.access.nextAvailableAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) }) : t("home.cardsPausedBody")}
      </p>
    </section>
  );
}
