import type { Metadata } from "next";
import { SignInScreen } from "@/components/screens/SignInScreen";
import { cleanOrderParam } from "@/lib/redeem/params";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("signin.titleDefault"), robots: { index: true, follow: true } };

type SP = Promise<{ purpose?: string; next?: string; order?: string; expired?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const order = cleanOrderParam(sp.order);
  const purpose = sp.purpose === "redeem" || order ? "redeem" : sp.purpose === "gift" ? "gift" : "default";
  return <SignInScreen purpose={purpose} order={order} next={sp.next} expired={sp.expired === "1"} />;
}
