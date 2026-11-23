import type { SessionUser } from "@/lib/auth/types";
import { getShellContext } from "@/lib/shell";
import { storeCartView } from "@/lib/open-store/cart";
import { asker } from "@/lib/open-store/owner";
import { storeShell } from "@/lib/open-store/pages";
import { Footer } from "@/components/Footer";
import { PromoBar } from "@/components/shop/PromoBar";
import { StoreHeader } from "./StoreHeader";

/** Every store page: the promotion bar for everyone, the store header, the page on white, the app's footer. */
export async function StoreFrame({ user, active, children }: { user: SessionUser | null; active: string | null; children: React.ReactNode }) {
  const [shell, store, cart] = await Promise.all([getShellContext(user), storeShell(), asker().then(storeCartView).catch(() => null)]);
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {store.promo && <PromoBar promo={store.promo} audience="everyone" />}
      <StoreHeader user={user} mainSiteUrl={shell.mainSiteUrl} thumbnails={shell.thumbnails} cardsEnabled={shell.cardsEnabled} circles={store.circles} active={active} cartCount={cart?.count ?? 0} />
      <main id="main" className="w-full flex-1">
        {children}
      </main>
      <Footer mainSiteUrl={shell.mainSiteUrl} />
    </div>
  );
}
