import Link from "next/link";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function HomeTabs({ active }: { active: "gifts" | "portraits" | "cards" }) {
  const tabs = [
    { key: "gifts", href: "/", label: t("home.tabGifts") },
    { key: "portraits", href: "/portraits", label: t("home.tabPortraits") },
    { key: "cards", href: "/cards", label: t("home.tabCards") },
  ] as const;
  return (
    <nav aria-label={t("home.tabsLabel")} className="mx-auto flex w-fit gap-1 rounded-[16px] bg-white p-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "rounded-[12px] px-5 py-2.5 text-[15px] font-semibold transition-colors",
            active === tab.key ? "bg-primary-gradient text-white shadow-primary" : "text-ink hover:bg-black/[0.04]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
