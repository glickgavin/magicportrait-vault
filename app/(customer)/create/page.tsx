import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { cleanEntryPoint, loadBuilder } from "@/lib/cards/builder-data";
import { getSetting } from "@/lib/settings";
import { BlockedScreen } from "@/components/builder/BlockedScreen";
import { FirstCard } from "@/components/builder/FirstCard";
import { ThemeStep } from "@/components/builder/ThemeStep";
import { t } from "@/lib/i18n";
import { SuperProps } from "@/components/SuperProps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("home.createCard") };

type SP = Promise<{ step?: string; category?: string; entry?: string; image?: string }>;

/** /create: FirstCard for someone with no cards (cards.first_card_mode = one_screen), else step 1. */
export default async function CreatePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser("/create");
  const { data, access, firstCardMode } = await loadBuilder(user.email, { imageId: sp.image });
  if (!access.allowed) return <BlockedScreen access={access} startPortraitUrl={await getSetting("links.start_portrait_url")} />;
  const entry = cleanEntryPoint(sp.entry);
  const sup = entry ? <SuperProps props={{ entry_point: entry }} /> : null;
  if (data.cardsCount === 0 && firstCardMode === "one_screen" && sp.step !== "theme")
    return (
      <>
        {sup}
        <FirstCard data={data} entryPoint={entry} />
      </>
    );
  return (
    <>
      {sup}
      <ThemeStep data={data} category={sp.category ?? null} entryPoint={entry} />
    </>
  );
}
