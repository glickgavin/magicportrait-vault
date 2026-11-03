import { t } from "@/lib/i18n";
import { ButtonLink } from "@/components/ui/Button";

export default function HomePlaceholder() {
  return (
    <section className="mx-auto max-w-md text-center">
      <p className="text-ink-2">{t("home.hi", { name: "there" })}</p>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">{t("home.title")}</h1>
      <div className="mt-6">
        <ButtonLink href="/create" size="lg" className="w-full">
          {t("home.createCard")}
        </ButtonLink>
      </div>
    </section>
  );
}
