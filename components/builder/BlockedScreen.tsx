import { ButtonLink } from "@/components/ui/Button";
import type { CardAccess } from "@/lib/cards/rules";
import { t } from "@/lib/i18n";

export function BlockedScreen({ access, startPortraitUrl }: { access: Exclude<CardAccess, { allowed: true }>; startPortraitUrl: string }) {
  const copy = {
    paused: [t("builder.paused"), t("builder.pausedBody")],
    locked: [t("builder.lockedTitle"), t("builder.lockedBody")],
    no_portraits: [t("builder.noPortraits"), t("builder.noPortraitsBody")],
    limit: [t("builder.limit"), t("builder.limitBody", { date: access.nextAvailableAt ? new Date(access.nextAvailableAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "" })],
  }[access.reason];
  return (
    <div className="mx-auto max-w-md pt-8 text-center" data-testid={`builder-${access.reason}`}>
      <h1 className="text-[26px] font-extrabold">{copy[0]}</h1>
      <p className="mt-2 text-[16px] text-ink-2">{copy[1]}</p>
      <div className="mt-6 flex flex-col gap-3">
        {access.reason === "locked" || access.reason === "no_portraits" ? (
          <ButtonLink href={startPortraitUrl} size="lg">
            {access.reason === "locked" ? t("home.orderNow") : t("home.createPortrait")}
          </ButtonLink>
        ) : null}
        <ButtonLink href="/" variant="secondary" size="lg">
          {t("builder.goHome")}
        </ButtonLink>
      </div>
    </div>
  );
}
