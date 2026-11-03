import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ButtonLink } from "@/components/ui/Button";
import { getShellContext } from "@/lib/shell";
import { t } from "@/lib/i18n";

export default async function NotFound() {
  const shell = await getShellContext();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={shell.user} mainSiteUrl={shell.mainSiteUrl} thumbnails={shell.thumbnails} cardsEnabled={shell.cardsEnabled} />
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pt-16 text-center">
        <h1 className="text-[26px] font-extrabold">{t("errors.notFoundTitle")}</h1>
        <p className="mt-2 text-ink-2">{t("errors.notFoundBody")}</p>
        <ButtonLink href="/" className="mt-6">
          {t("errors.goHome")}
        </ButtonLink>
      </main>
      <Footer mainSiteUrl={shell.mainSiteUrl} />
    </div>
  );
}
