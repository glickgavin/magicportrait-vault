import type { Metadata } from "next";
import { SignInScreen } from "@/components/screens/SignInScreen";
import { cleanOrderParam } from "@/lib/redeem/params";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("signin.titleRedeemNoOrder") };

/** Old /redeem/:orderId links. */
export default async function RedeemOrderPage({ params }: { params: Promise<{ order: string }> }) {
  const order = cleanOrderParam(decodeURIComponent((await params).order));
  return <SignInScreen purpose="redeem" order={order} legacyRedeem />;
}
