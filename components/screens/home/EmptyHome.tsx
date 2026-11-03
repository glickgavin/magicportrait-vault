import { ImageOff } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { TrackPageView } from "@/components/TrackPageView";
import { TrackedLink } from "@/components/TrackedLink";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

/** Nobody found on this email: kind, with one clear next step. */
export function EmptyHome({ startPortraitUrl, mirrorSince }: { startPortraitUrl: string; mirrorSince: string }) {
  return (
    <div className="mx-auto max-w-[440px] pt-6 text-center" data-testid="home-empty">
      <TrackPageView event="page_view_vault_empty" />
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-tint" aria-hidden="true">
        <ImageOff className="h-7 w-7 text-magenta" />
      </span>
      <h1 className="mt-4 text-[26px] font-extrabold leading-tight">{t("home.emptyTitle")}</h1>
      <p className="mt-2 text-[16px] text-ink-2">{t("home.emptyBody", { date: fmtDate(mirrorSince) })}</p>
      <div className="mt-6 flex flex-col gap-3">
        <SignOutButton withIcon={false} label={t("home.tryAnotherEmail")} className="h-12 rounded-[12px] bg-primary-gradient text-[16px] font-semibold text-white shadow-primary" />
        <TrackedLink href={startPortraitUrl} event="vault_new_portrait_tapped" className="inline-flex h-12 items-center justify-center rounded-[12px] border border-line bg-white font-semibold">
          {t("home.createPortrait")}
        </TrackedLink>
      </div>
    </div>
  );
}
