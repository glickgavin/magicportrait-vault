import "server-only";
import { getSetting } from "@/lib/settings";

/** The production deployment never allows it, whatever the setting says (settings are shared with previews). */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** Test sign-in (any email, no code): only off-production and only when `auth.test_signin_enabled` is on. */
export async function testSignInAllowed(): Promise<boolean> {
  if (isProductionDeployment()) return false;
  return getSetting("auth.test_signin_enabled");
}
