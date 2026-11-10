import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getShellContext } from "@/lib/shell";
import { Identify } from "@/components/Identify";
import { personProps } from "@/lib/vault/identity";
import { shopShell } from "@/lib/shop/shell";
import { PromoBar } from "@/components/shop/PromoBar";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShellContext();
  const person = shell.user ? await personProps(shell.user.email) : null;
  // The shop's header bits (docs/shop.md): null, and nothing renders, while the shop is hidden from this person.
  const shop = await shopShell(shell.user);
  return (
    <div className="flex min-h-dvh flex-col">
      {person && <Identify person={person} />}
      {shop?.promo && <PromoBar promo={shop.promo} audience={shop.customerType} />}
      <Header user={shell.user} mainSiteUrl={shell.mainSiteUrl} thumbnails={shell.thumbnails} cardsEnabled={shell.cardsEnabled} shop={shop} />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-8 pt-6">
        {children}
      </main>
      <Footer mainSiteUrl={shell.mainSiteUrl} />
    </div>
  );
}
