import { t } from "@/lib/i18n";

/**
 * Shown the moment someone taps a link, while the next page is read on the server (Next.js streams the
 * page in when it's ready). The header stays; only the page area shows this placeholder.
 */
export default function Loading() {
  const block = "animate-pulse rounded-[16px] bg-black/[0.06]";
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-[640px] flex-col gap-4" data-testid="page-loading">
      <span className="sr-only">{t("ui.loading")}</span>
      <div className={`${block} h-8 w-2/3`} aria-hidden="true" />
      <div className={`${block} h-4 w-1/2`} aria-hidden="true" />
      <div className={`${block} mt-2 h-[180px] w-full`} aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3" aria-hidden="true">
        <div className={`${block} aspect-square`} />
        <div className={`${block} aspect-square`} />
      </div>
    </div>
  );
}
