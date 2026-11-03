import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getShellContext } from "@/lib/shell";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShellContext();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={shell.user} mainSiteUrl={shell.mainSiteUrl} thumbnails={shell.thumbnails} cardsEnabled={shell.cardsEnabled} />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-8 pt-6">
        {children}
      </main>
      <Footer mainSiteUrl={shell.mainSiteUrl} />
    </div>
  );
}
