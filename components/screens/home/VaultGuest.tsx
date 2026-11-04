import { ChevronRight, Crown, Lock } from "lucide-react";
import Link from "next/link";
import { CardFanStatic } from "@/components/CardFanStatic";
import { PortraitTile } from "@/components/vault/PortraitTile";
import { TrackPageView } from "@/components/TrackPageView";
import { TrackedLink } from "@/components/TrackedLink";
import type { HomeData } from "@/lib/vault/home";
import { t } from "@/lib/i18n";
import { fmtAgo } from "@/lib/format";
import { tn } from "@/lib/i18n";

/** Home for a creator with no order: latest session, all portraits, locked cards and the first-order offer. */
export function VaultGuest({ data }: { data: HomeData }) {
  const { profile } = data;
  const latest = profile.sessions[0];
  return (
    <div className="mx-auto max-w-[560px]" data-testid="home-guest">
      <TrackPageView event="page_view_vault_guest" props={{ portrait_count: profile.portraitCount }} />
      {data.cardsEnabled && <TrackPageView event="vault_cards_locked_viewed" />}
      <p className="text-center text-[16px] text-ink-2">{t("home.welcomeBack")}</p>
      <h1 className="text-center text-[30px] font-extrabold tracking-tight">{t("home.title")}</h1>
      <p className="text-center text-[15px] text-ink-2">{t("home.guestSub")}</p>

      {latest && (
        <section className="mt-5 rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="latest-title">
          <div className="flex items-center gap-3 px-1 pb-3 pt-1">
            <img src={latest.portraits[0]?.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover shadow-[0_0_0_3px_#fff,0_1px_6px_rgba(0,0,0,0.15)]" />
            <div>
              <h2 id="latest-title" className="text-[17px] font-bold">
                {latest.themeName ?? t("portraits.untitled")}
              </h2>
              <p className="text-[13px] text-ink-2">
                {t("home.sessionMeta", { pet: latest.petName ? `${latest.petName} · ` : "", ago: fmtAgo(latest.createdAt), count: tn("home.portraitsCount", latest.portraits.length) })}
              </p>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {latest.portraits.slice(0, 6).map((p, i) => (
              <li key={p.imageId}>
                <PortraitTile src={p.imageUrl} alt={t("portraits.portraitAlt", { n: i + 1, theme: latest.themeName ?? "" })} />
              </li>
            ))}
          </ul>
          <TrackedLink
            href={latest.orderUrl}
            event="vault_order_wall_art_tapped"
            props={{ session_id: latest.sessionId, theme_slug: latest.themeSlug, ordered_before: false }}
            className="mt-3 flex h-12 items-center justify-center rounded-[12px] bg-primary-gradient text-[16px] font-semibold text-white shadow-primary hover:opacity-90"
          >
            {t("home.orderWallArt")}
          </TrackedLink>
        </section>
      )}

      <Link href="/portraits" className="mt-4 flex items-center justify-between rounded-[18px] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <span>
          <span className="block text-[16px] font-bold">{t("home.allMyPortraits")}</span>
          <span className="block text-[14px] text-ink-2">{t("home.sessionsSummary", { sessions: profile.sessions.length, portraits: profile.portraitCount })}</span>
        </span>
        <span className="ml-auto mr-1 shrink-0 text-[15px] font-semibold text-pink-link">{t("home.seeAll")}</span>
        <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden="true" />
      </Link>

      {data.cardsEnabled && (
      <section className="mt-4 rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="cards-locked" aria-labelledby="locked-title">
        <div className="relative rounded-[16px] bg-[#F6E3F2] px-4 py-5">
          <div role="img" aria-label={t("home.lockedImageLabel")}>
            <CardFanStatic
              locked={
                <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md">
                  <Lock className="h-6 w-6 text-magenta" aria-hidden="true" />
                </span>
              }
            />
          </div>
        </div>
        <div className="px-2 pb-2 pt-4">
          <span className="rounded-full bg-pink-tint px-3 py-1 text-[13px] font-bold text-pink-dark">{t("home.lockedTitle")}</span>
          <h2 id="locked-title" className="mt-3 text-[20px] font-extrabold">
            {t("home.lockedHeading")}
          </h2>
          <p className="mt-1 text-[16px] text-ink-2">{t("home.lockedBody")}</p>
        </div>
      </section>
      )}

      {data.firstOrderOffer && (
        <div className="mt-4 flex items-start gap-3 rounded-[18px] bg-black/[0.05] px-4 py-4" data-testid="first-order-offer">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-magenta" aria-hidden="true" />
          <p className="text-[15px]">
            <strong>{data.firstOrderOffer}</strong> {t("home.offerSuffix")}{" "}
            <TrackedLink href={data.startPortraitUrl} event="vault_offer_tapped" props={{ offer_code: data.firstOrderOfferCode || null }} className="link">
              {t("home.seeOffer")}
            </TrackedLink>
          </p>
        </div>
      )}
    </div>
  );
}
