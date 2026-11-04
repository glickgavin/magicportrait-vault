import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { recentAdminChanges, settingRows, superUsers } from "@/lib/admin/data";
import { sourceStatuses } from "@/lib/admin/sources";
import { SettingField } from "@/components/admin/SettingField";
import { SettingsTable } from "@/components/admin/SettingsTable";
import { SuperUsersCard } from "@/components/admin/SuperUsersCard";
import { DataSourcesCard } from "@/components/admin/DataSourcesCard";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "General & variables" };

const CARD_KEYS = ["cards.enabled", "cards.who_can_create", "cards.per_customer", "cards.price"];
const REDEEM_KEYS = ["redeem.downloads_enabled", "redeem.mug_offer_active", "redeem.mug_lock_mode"];
const TEST_KEYS = ["auth.test_signin_enabled"];

export default async function GeneralSettings() {
  const user = await requireSuperUser();
  const [rows, users, sources, changes] = await Promise.all([settingRows(), superUsers(), sourceStatuses(), recentAdminChanges()]);
  const pick = (keys: string[]) => keys.map((k) => rows.find((r) => r.key === k)!).filter(Boolean);
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "general" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">General &amp; variables</h1>
      <p className="text-[15px] text-ink-2">Master data used across the app instead of hard-coded values. Every change is logged.</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {[
            ["Greeting cards", pick(CARD_KEYS)],
            ["Redeem: downloads & mugs", pick(REDEEM_KEYS)],
            ["Testing (previews only, never on my.magicportraits.ai)", pick(TEST_KEYS)],
          ].map(([title, list]) => (
            <section key={title as string} className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
              <h2 className="text-[19px] font-extrabold">{title as string}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(list as typeof rows).map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3 rounded-[14px] bg-black/[0.03] p-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{r.label}</p>
                      <p className="truncate font-mono text-[12px] text-ink-2">{r.key}</p>
                    </div>
                    <SettingField row={r} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          <SettingsTable rows={rows} />
        </div>
        <div className="flex flex-col gap-5">
          <SuperUsersCard users={users} me={user.email} />
          <DataSourcesCard sources={sources} />
          <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
            <h2 className="text-[19px] font-extrabold">Recent changes</h2>
            <ul className="mt-2 flex flex-col gap-2 text-[14px]">
              {changes.map((c) => (
                <li key={c.id}>
                  <strong>{c.actor.replace("super_user:", "")}</strong> {c.event.replace(/_/g, " ")} {c.ref_id ? <code className="text-[12px]">{c.ref_id}</code> : null}
                  <span className="text-ink-2"> · {new Date(c.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
              {!changes.length && <li className="text-ink-2">No changes yet.</li>}
            </ul>
            <Link href="/settings/activity" className="link mt-3 inline-block text-[14px]">
              Full activity log
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
