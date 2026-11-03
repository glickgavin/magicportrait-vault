import { requireUser } from "@/lib/auth/session";
import { loadHome } from "@/lib/vault/home";
import { getSetting } from "@/lib/settings";
import { FirstHome } from "@/components/screens/home/FirstHome";
import { VaultHome } from "@/components/screens/home/VaultHome";
import { VaultGuest } from "@/components/screens/home/VaultGuest";
import { EmptyHome } from "@/components/screens/home/EmptyHome";

export const dynamic = "force-dynamic";

/** `/`: FirstHome (no cards yet), VaultHome (has cards), VaultGuest (creator), or the empty state. */
export default async function HomePage() {
  const user = await requireUser("/");
  const data = await loadHome(user.email);
  const { profile } = data;
  if (profile.state === "nobody") return <EmptyHome startPortraitUrl={data.startPortraitUrl} mirrorSince={data.mirrorSince} />;
  if (!data.access.allowed && (data.access.reason === "locked" || (data.access.reason === "paused" && !profile.hasFreeGift))) return <VaultGuest data={data} />;
  if (data.cardsCount === 0 && data.cardsEnabled) return <FirstHome data={data} footerText={await getSetting("cards.footer_text")} />;
  return <VaultHome data={data} />;
}
