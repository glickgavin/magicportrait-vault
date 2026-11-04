import Link from "next/link";
import { db } from "@/lib/db/client";
import { loadThemeTables } from "@/lib/db/themes";
import { themeAssetUrl } from "@/lib/render/assets";
import { settingRows } from "@/lib/admin/data";
import { SettingField } from "@/components/admin/SettingField";
import { CategoryControls, NewThemeForm, NewVersionForm, ThemeLiveToggle, ThemeStatus, VersionOrder } from "@/components/admin/ThemeControls";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Theme library" };

const GIFT_KEYS = ["cards.enabled", "cards.who_can_create", "cards.per_customer", "cards.first_card_mode", "gift.unlock_rule", "gift.offer_email_enabled", "gift.popup_enabled", "gift.reminder_email_enabled", "themes.in_season_days_before"];
const mmdd = (d: string | null) => (d ? d.slice(5) : null);

export default async function ThemeLibrary({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [{ categories, themes, versions }, rows, uses] = await Promise.all([loadThemeTables(), settingRows(), db().from("cards").select("version_id").limit(100000)]);
  const useCount = new Map<string, number>();
  for (const c of (uses.data ?? []) as { version_id: string | null }[]) if (c.version_id) useCount.set(c.version_id, (useCount.get(c.version_id) ?? 0) + 1);
  const shown = themes.filter((t) => !category || categories.find((c) => c.id === t.category_id)?.slug === category);
  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "themes" }} />
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Theme library</h1>
        <p className="text-[15px] text-ink-2">Customers see live versions of live themes inside their dates. Use a theme’s Live switch to publish all its versions at once, or publish one version from the template editor.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <nav aria-label="Category filter" className="flex flex-wrap gap-2">
            <Link href="/settings/themes" aria-current={!category ? "page" : undefined} className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold ${!category ? "bg-[#2b2b2b] text-white" : "bg-white"}`}>
              All
            </Link>
            {categories.map((c) => (
              <Link key={c.id} href={`/settings/themes?category=${c.slug}`} aria-current={category === c.slug ? "page" : undefined} className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold ${category === c.slug ? "bg-[#2b2b2b] text-white" : "bg-white"}`}>
                {c.name}
              </Link>
            ))}
          </nav>
          {shown.map((t) => {
            const vs = versions.filter((v) => v.theme_id === t.id).sort((a, b) => a.sort_order - b.sort_order);
            const cat = categories.find((c) => c.id === t.category_id);
            return (
              <section key={t.id} className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby={`t-${t.id}`} data-testid={`theme-${t.slug}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id={`t-${t.id}`} className="text-[19px] font-extrabold">
                      {t.name} <span className="text-[13px] font-semibold text-ink-2">· {cat?.name}</span>
                    </h2>
                    <p className="text-[13px] text-ink-2">{t.available_from ? `Shown ${mmdd(t.available_from)} → ${mmdd(t.available_to)} every year` : "Always available"}</p>
                  </div>
                  <ThemeLiveToggle id={t.id} name={t.name} themeLive={t.status === "live"} liveCount={vs.filter((v) => v.status === "live").length} draftCount={vs.filter((v) => v.status === "draft").length} />
                </div>
                <div className="mt-2">
                  <ThemeStatus id={t.id} status={t.status} from={mmdd(t.available_from)} to={mmdd(t.available_to)} name={t.name} />
                </div>
                <ul className="mt-3 grid gap-2">
                  {vs.map((v, i) => (
                    <li key={v.id} className="flex items-center gap-3 rounded-[12px] border border-line p-2">
                      <img src={themeAssetUrl(v.thumbnail_path ?? v.background_path) ?? ""} alt="" className="h-[70px] w-[50px] rounded-[4px] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          {v.name} {v.is_new && <span className="ml-1 rounded-full bg-pink-tint px-2 text-[11px] font-extrabold text-pink-dark">NEW</span>}
                        </p>
                        <p className="text-[13px] text-ink-2">
                          {v.status} · {useCount.get(v.id) ?? 0} cards · <code>{t.slug}-{v.slug}</code>
                        </p>
                      </div>
                      <VersionOrder id={v.id} sort={v.sort_order} label={v.name} prevId={vs[i - 1]?.id} prevSort={vs[i - 1]?.sort_order} nextId={vs[i + 1]?.id} nextSort={vs[i + 1]?.sort_order} />
                      <Link href={`/settings/themes/${t.id}/versions/${v.id}`} className="rounded-[10px] bg-black/[0.06] px-3 py-1.5 text-[14px] font-bold">
                        Edit
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-2">
                  <NewVersionForm themeId={t.id} themeName={t.name} />
                </div>
              </section>
            );
          })}
          <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
            <h2 className="mb-3 text-[19px] font-extrabold">Add a theme</h2>
            <NewThemeForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
          </section>
        </div>
        <div className="flex flex-col gap-5">
          <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
            <h2 className="text-[19px] font-extrabold">Gift panel</h2>
            <p className="text-[13px] text-ink-2">The same settings as General &amp; variables (one value each).</p>
            <ul className="mt-3 flex flex-col gap-3">
              {GIFT_KEYS.map((k) => rows.find((r) => r.key === k)!).map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2">
                  <span className="text-[14px]">
                    {r.label}
                    <br />
                    <code className="text-[11px] text-ink-2">{r.key}</code>
                  </span>
                  <SettingField row={r} />
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
            <h2 className="text-[19px] font-extrabold">Manage categories</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {categories.map((c) => (
                <li key={c.id}>
                  <CategoryControls id={c.id} name={c.name} reminder={c.reminder_enabled} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
