import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { SessionUser } from "@/lib/auth/types";
import { t } from "@/lib/i18n";
import { AdminNavLink } from "./AdminNavLink";

const GROUPS = [
  ["admin.groups.insights", [["/settings/insights", "admin.nav.dashboard"], ["/settings/customers", "admin.nav.customers"], ["/settings/cards", "admin.nav.cards"]]],
  ["admin.groups.setup", [["/settings", "admin.nav.general"]]],
  ["admin.groups.cards", [["/settings/themes", "admin.nav.themes"], ["/settings/template", "admin.nav.template"]]],
  ["admin.groups.redeem", [["/settings/redeem", "admin.nav.redeem"]]],
  ["admin.groups.system", [["/settings/emails", "admin.nav.emails"], ["/settings/tracking", "admin.nav.tracking"], ["/settings/data-sources", "admin.nav.dataSources"], ["/settings/super-users", "admin.nav.superUsers"], ["/settings/activity", "admin.nav.activity"]]],
] as const;

/** Settings: desktop first, with the dark sidebar (INSIGHTS · SETUP · GREETING CARDS · REDEEM · SYSTEM). */
export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="bg-sidebar text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <Link href="/settings" className="text-[19px] font-extrabold">
            {t("admin.title")}
          </Link>
          <span className="bg-primary-gradient rounded-full px-2 py-0.5 text-[11px] font-bold">{t("ui.account.superUser")}</span>
        </div>
        <nav aria-label={t("admin.title")} className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:overflow-y-auto">
          {GROUPS.map(([g, items]) => (
            <div key={g} className="contents lg:block">
              <p className="hidden px-3 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60 lg:block">{t(g)}</p>
              {items.map(([href, label]) => (
                <AdminNavLink key={href} href={href} label={t(label)} />
              ))}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-white/15 px-6 py-4 lg:block">
          <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold text-white/90 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("admin.back")}
          </Link>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/80">
            <Avatar initials={user.initials} size={28} />
            <span className="truncate">{user.email}</span>
          </div>
        </div>
      </aside>
      <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
