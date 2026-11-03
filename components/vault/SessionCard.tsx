import { ButtonLink } from "@/components/ui/Button";
import { PortraitTile } from "@/components/vault/PortraitTile";
import { TrackedLink } from "@/components/TrackedLink";
import type { SessionGroup } from "@/lib/vault/profile-core";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

export function SessionCard({ group, filter = "all", canMakeCard, maxTiles }: { group: SessionGroup; filter?: "all" | "ordered" | "not_ordered"; canMakeCard: boolean; maxTiles?: number }) {
  const shown = group.portraits.filter((p) => (filter === "ordered" ? p.ordered : filter === "not_ordered" ? !p.ordered : true)).slice(0, maxTiles ?? 99);
  const notOrdered = group.portraits.filter((p) => !p.ordered).length;
  const theme = group.themeName ?? t("portraits.untitled");
  const pet = group.petName ? `${group.petName} · ` : "";
  const meta = notOrdered ? t("portraits.metaNotOrdered", { pet, date: fmtDate(group.createdAt), count: notOrdered }) : t("portraits.metaAllOrdered", { pet, date: fmtDate(group.createdAt) });
  const first = group.portraits[0];
  return (
    <section className="rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="session-card" aria-label={theme}>
      <div className="flex items-start gap-3 px-1 pb-3 pt-1">
        {first && <img src={first.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover shadow-[0_0_0_3px_#fff,0_1px_6px_rgba(0,0,0,0.15)]" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold leading-tight">
            {theme}
            {group.isRecommendationChild && <span className="ml-2 align-middle text-[12px] font-semibold text-ink-2">{t("portraits.recommended")}</span>}
          </h2>
          <p className="text-[13px] text-ink-2">{meta}</p>
        </div>
        {group.orderNames[0] && <span className="shrink-0 rounded-full bg-[#e3f4e8] px-2.5 py-1 text-[12px] font-bold text-[#1f6b35]">{t("portraits.orderBadge", { order: group.orderNames[0] })}</span>}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {shown.map((p, i) => (
          <li key={p.imageId}>
            <PortraitTile src={p.imageUrl} ordered={p.ordered} alt={t(p.ordered ? "portraits.portraitAltOrdered" : "portraits.portraitAlt", { n: i + 1, theme })} />
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TrackedLink
          href={group.orderUrl}
          event="vault_order_wall_art_tapped"
          props={{ session_id: group.sessionId, theme_slug: group.themeSlug, ordered_before: group.ordered }}
          className="inline-flex h-11 items-center justify-center rounded-[12px] bg-primary-gradient px-3 text-[15px] font-semibold text-white shadow-primary hover:opacity-90"
        >
          {group.ordered ? t("portraits.orderMore") : t("portraits.orderWallArt")}
        </TrackedLink>
        {canMakeCard && (
          <ButtonLink href={`/create?image=${group.portraits[0]?.imageId ?? ""}&entry=my_portraits`} variant="ghost" className="h-11 px-3 text-[15px]">
            {t("portraits.makeCard")}
          </ButtonLink>
        )}
      </div>
    </section>
  );
}
