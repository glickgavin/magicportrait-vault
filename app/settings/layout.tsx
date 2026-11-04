import type { Metadata } from "next";
import { requireSuperUser } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: t("admin.title"), template: `%s · ${t("admin.title")}` }, robots: { index: false, follow: false } };

/** Every Settings page: 404 unless the signed-in email is a super user. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
