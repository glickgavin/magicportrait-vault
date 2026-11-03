import type { Metadata } from "next";
import { SignInScreen } from "@/components/screens/SignInScreen";
import { cleanOrderParam } from "@/lib/redeem/params";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("signin.titleRedeemNoOrder") };

/** Old /redeem and /redeem?order=… links land here (RedeemEntry). */
export default async function RedeemPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const order = cleanOrderParam((await searchParams).order);
  return <SignInScreen purpose="redeem" order={order} legacyRedeem />;
}
