import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { loadBuilder } from "@/lib/cards/builder-data";
import { getSetting } from "@/lib/settings";
import { BlockedScreen } from "@/components/builder/BlockedScreen";
import { PortraitStep } from "@/components/builder/PortraitStep";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("builder.choosePortrait") };

export default async function PortraitStepPage({ searchParams }: { searchParams: Promise<{ v?: string; image?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/create");
  const { data, access } = await loadBuilder(user.email, { imageId: sp.image });
  if (!access.allowed) return <BlockedScreen access={access} startPortraitUrl={await getSetting("links.start_portrait_url")} />;
  return <PortraitStep data={data} versionId={sp.v ?? null} imageId={sp.image ?? null} />;
}
