import Link from "next/link";
import type { SessionUser } from "@/lib/auth/types";
import type { Circle } from "@/lib/open-store/pages";
import { t } from "@/lib/i18n";
import { MenuSheet } from "@/components/MenuSheet";
import { AccountMenu } from "@/components/AccountMenu";
import { TrackedLink } from "@/components/TrackedLink";
import { StoreCart } from "./StoreCart";

/**
 * The store's header (docs/open-store.md › Store page): the app's menu and logo, the cart on the right.
 * No sign-in needed: on phones "Sign in" stays in the menu; on desktop it sits beside the cart, with the
 * category links in the middle. Signed-in customers get the usual account menu.
 */
export function StoreHeader({ user, mainSiteUrl, thumbnails, cardsEnabled, circles, active, cartCount }: { user: SessionUser | null; mainSiteUrl: string; thumbnails: string[]; cardsEnabled: boolean; circles: Circle[]; active: string | null; cartCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#E7E3D8] bg-page">
      <div className="relative mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-1.5 lg:h-[72px] lg:px-10">
        <div className="lg:hidden">
          <MenuSheet user={user} mainSiteUrl={mainSiteUrl} thumbnails={thumbnails} cardsEnabled={cardsEnabled} />
        </div>
        <Link href="/store" aria-label={t("store.name")} className="absolute left-1/2 top-[13px] -translate-x-1/2 lg:static lg:translate-x-0">
          <img src="/mp-logo.svg" alt={t("app.logoAlt")} width={156} height={30} className="h-[30px] w-auto" />
        </Link>
        {circles.length > 0 && (
          <nav aria-label={t("store.categories")} className="ml-8 hidden items-center gap-6 lg:flex">
            {circles.map((c) => (
              <Link key={c.handle} href={c.href} aria-current={c.handle === active ? "page" : undefined} className={c.handle === active ? "border-b-2 border-[#DD07C4] py-1 text-[15px] font-extrabold text-pink-dark" : "py-1 text-[15px] font-bold text-ink hover:text-pink-dark"}>
                {c.title}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <div className="relative h-14 w-[56px]">
              <AccountMenu user={user} />
            </div>
          ) : (
            <TrackedLink href="/signin?next=/store" event="store_signin_tapped" props={{ page: "store" }} className="hidden h-11 items-center px-3 text-[15px] font-bold text-ink hover:text-pink-dark lg:flex">
              {t("store.signIn")}
            </TrackedLink>
          )}
          <StoreCart count={cartCount} />
        </div>
      </div>
    </header>
  );
}
