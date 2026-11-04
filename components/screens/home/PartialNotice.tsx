import { t } from "@/lib/i18n";

/** Shown when a live source (Shopify, Imagen, events mirror) failed and the page is partial. */
export function PartialNotice() {
  return (
    <div role="status" className="mx-auto mt-4 max-w-md rounded-xl border border-line bg-white px-4 py-3 text-center" data-testid="partial-notice">
      <p className="font-bold">{t("errors.partialTitle")}</p>
      <p className="mt-1 text-sm text-ink-2">{t("errors.partialBody")}</p>
    </div>
  );
}
