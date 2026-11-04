import Link from "next/link";
import { ShoppingBag, UserRound } from "lucide-react";
import type { SessionUser } from "@/lib/auth/types";
import { MenuSheet } from "@/components/MenuSheet";
import { AccountMenu } from "@/components/AccountMenu";
import { t } from "@/lib/i18n";
import { CART_PATH, mainSite } from "@/lib/site-links";

export function Header({ user, mainSiteUrl, thumbnails, cardsEnabled }: { user: SessionUser | null; mainSiteUrl: string; thumbnails?: string[]; cardsEnabled?: boolean }) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-page/95 backdrop-blur supports-[backdrop-filter]:bg-page/80">
      <div className="relative mx-auto flex h-14 max-w-2xl items-center px-4">
        <MenuSheet user={user} mainSiteUrl={mainSiteUrl} thumbnails={thumbnails} cardsEnabled={cardsEnabled} />
        <Link href="/" aria-label={t("app.name")} className="absolute left-1/2 top-[13px] -translate-x-1/2">
          <img src="/mp-logo.svg" alt={t("app.logoAlt")} width={156} height={30} className="h-[30px] w-auto" />
        </Link>
        {user ? (
          <AccountMenu user={user} />
        ) : (
          <Link href="/signin" aria-label={t("ui.account.signIn")} className="absolute right-[56px] top-1/2 flex h-11 w-11 -translate-y-1/2 flex-col items-center justify-center text-ink">
            <UserRound className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-semibold leading-none">{t("ui.account.signIn")}</span>
          </Link>
        )}
        <a href={mainSite(mainSiteUrl, CART_PATH)} aria-label={t("ui.cart")} className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[12px] bg-black/[0.05] hover:bg-black/10">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
