import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { CardFanStatic } from "@/components/CardFanStatic";
import { HomeTabs } from "@/components/vault/HomeTabs";
import { PortraitTile } from "@/components/vault/PortraitTile";
import { CardStatusLabel } from "@/components/vault/CardStatusLabel";
import { TrackPageView } from "@/components/TrackPageView";
import { CardsBlocked } from "./FirstHome";
import type { HomeData } from "@/lib/vault/home";
import { t, tn } from "@/lib/i18n";

/** Home after the first card (VaultHome). */
export function VaultHome({ data }: { data: HomeData }) {
  const { profile, cards } = data;
  const portraits = profile.sessions.flatMap((s) => s.portraits).slice(0, 3);
  return (
    <div className="mx-auto max-w-[560px]" data-testid="home-vault">
      <TrackPageView event="page_view_vault_home" props={{ is_customer: profile.isCustomer, cards_created: data.cardsCount }} />
      <p className="text-center text-[16px] text-ink-2">{profile.firstName ? t("home.hi", { name: profile.firstName }) : t("home.hiAnon")}</p>
      <h1 className="text-center text-[30px] font-extrabold tracking-tight">{t("home.title")}</h1>
      <div className="mt-4">
        <HomeTabs active="gifts" />
      </div>
      {data.access.allowed ? (
        <section className="mt-5 rounded-[24px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.05)]" aria-labelledby="cards-title">
          <div className="relative rounded-[18px] bg-[#F6E3F2] px-4 pb-4 pt-10">
            <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[13px] font-bold text-pink-dark">{t("home.freeUnlimited")}</span>
            <CardFanStatic />
          </div>
          <div className="px-3 pb-3 pt-4">
            <h2 id="cards-title" className="text-[22px] font-extrabold">
              {t("home.cardsTitle")}
            </h2>
            <p className="mt-1 text-[16px] text-ink-2">{t("home.cardsBody")}</p>
            <ButtonLink href="/create?entry=home" size="lg" className="mt-4 w-full">
              {t("home.createCard")} <Sparkles className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      ) : (
        <CardsBlocked data={data} />
      )}

      {cards.length > 0 && (
        <section className="mt-6" aria-labelledby="recent-title">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-title" className="text-[19px] font-extrabold">
              {t("home.recentCards")}
            </h2>
            <Link href="/cards" className="link text-[15px]" aria-label={t("home.seeAllCards")}>
              {t("home.seeAll")}
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {cards.slice(0, 2).map((c) => (
              <li key={c.id}>
                <Link href={`/cards/${c.public_id}`} className="flex items-center gap-3 rounded-[16px] bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
                  <img src={`/api/cards/${c.id}/image?size=thumb`} alt="" width={60} height={84} className="h-[84px] w-[60px] shrink-0 rounded-[4px] object-cover shadow-sm ph-no-capture" />
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-bold" data-ph-mask>
                      {c.to_name}
                    </span>
                    <CardStatusLabel card={c} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="portraits-title">
        <div className="flex items-baseline justify-between">
          <h2 id="portraits-title" className="text-[19px] font-extrabold">
            {t("home.yourPortraits")} <span className="ml-1 text-[15px] font-semibold text-ink-2" data-testid="portrait-count">{tn("home.portraitsCount", profile.portraitCount)}</span>
          </h2>
          <Link href="/portraits" className="link text-[15px]" data-testid="portraits-see-all">
            {t("home.seeAll")}
          </Link>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {portraits.map((p, i) => (
            <li key={p.imageId}>
              <PortraitTile src={p.imageUrl} alt={t("portraits.portraitAlt", { n: i + 1, theme: profile.sessions.find((s) => s.sessionId === p.sessionId)?.themeName ?? "" })} />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex items-center gap-4 rounded-[18px] border-2 border-dashed border-black/10 px-4 py-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.05]" aria-hidden="true">
          <Gift className="h-5 w-5 text-ink-2" />
        </span>
        <div>
          <p className="text-[16px] font-bold">{t("home.moreGifts")}</p>
          <p className="text-[14px] text-ink-2">{t("home.moreGiftsBody")}</p>
        </div>
      </div>
    </div>
  );
}
