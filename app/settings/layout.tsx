import { requireSuperUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Every Settings page: 404 unless the signed-in email is a super user. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperUser();
  return <>{children}</>;
}
