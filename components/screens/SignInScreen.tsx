import { redirect } from "next/navigation";
import { CardFan } from "@/components/CardFan";
import { SignInForm } from "@/components/SignInForm";
import { TrackPageView } from "@/components/TrackPageView";
import { getSessionUser, safeNext } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { testSignInAllowed } from "@/lib/auth/test-signin";

export type SignInPurpose = "gift" | "redeem" | "default";

/** SignIn and RedeemEntry: email, then a 6-digit code. Signed-in people go straight on. */
export async function SignInScreen({ purpose, order, next, expired, legacyRedeem }: { purpose: SignInPurpose; order: string | null; next?: string; expired?: boolean; legacyRedeem?: boolean }) {
  const target = safeNext(next ?? (order ? `/orders/${order}` : purpose === "redeem" ? "/orders" : purpose === "gift" ? "/create" : "/"));
  const user = await getSessionUser();
  if (user) redirect(target);
  const [minutes, testSignIn] = await Promise.all([getSetting("auth.code_valid_minutes"), testSignInAllowed()]);
  // Card wording on /signin, except for people on their way to orders or redeem (4 Nov review).
  const cardWording = purpose === "gift" || (purpose === "default" && !/^\/(orders|redeem)(\/|\?|$)/.test(target));
  const title = purpose === "redeem" ? (order ? t("signin.titleRedeem", { order: `#${order}` }) : t("signin.titleRedeemNoOrder")) : cardWording ? t("signin.titleGift") : t("signin.titleDefault");
  const sub = purpose === "redeem" ? t("signin.subRedeem") : cardWording ? t("signin.subGift") : t("signin.subDefault");
  return (
    <div className="mx-auto max-w-[440px]">
      {legacyRedeem && <TrackPageView event="page_view_redeem" props={{ page_path: "/redeem", order_id_in_url: Boolean(order) }} />}
      <CardFan />
      <h1 className="mt-6 text-center text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 text-center text-[16px] leading-snug text-ink-2">{sub}</p>
      <div className="mt-5">
        <SignInForm purpose={purpose} next={target} expired={Boolean(expired)} codeMinutes={minutes} testSignIn={testSignIn} />
      </div>
      <p className="mt-10 text-center text-[14px] text-ink-2">{t("signin.orderEmailNote")}</p>
    </div>
  );
}
