import Link from "next/link";
import { cardActions, cardsPerDay, entries, funnel, kpis, liveFeed, RANGES, topThemes, type Range } from "@/lib/admin/insights";
import { env } from "@/lib/env";
import { fmtBiz, zoneName } from "@/lib/biztime";
import { getSettings } from "@/lib/settings";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

const STEPS: [string, string][] = [
  ["signed_in", "Signed in"],
  ["theme_selected", "Picked a design"],
  ["create_tapped", "Tapped Create"],
  ["created", "Card made"],
  ["delivered", "Sent, shared or downloaded"],
];

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const r = (await searchParams).range;
  const range: Range = r && r in RANGES ? (r as Range) : "7d";
  const s = await getSettings(["tracking.posthog_project_id", "tracking.posthog_ui_host", "tracking.entry_links", "brand.timezone"] as const);
  const tz = s["brand.timezone"];
  const now = new Date();
  const [tiles, perDay, themes, steps, feed, actions, arrivals] = await Promise.all([kpis(range, now, tz), cardsPerDay(range, now, tz), topThemes(range, now, tz), funnel(range, now, tz), liveFeed(), cardActions(range, now, tz), entries(range, s["tracking.entry_links"], now, tz)]);
  const zoneLabel = zoneName(tz, now);
  const ACTIONS: [keyof Omit<typeof actions, "made" | "not_yet">, string][] = [
    ["emailed", "Emailed"],
    ["shared", "Shared"],
    ["link_copied", "Link copied"],
    ["downloaded", "Downloaded"],
  ];
  const actionTop = Math.max(1, actions.made, ...ACTIONS.map(([k]) => actions[k].cards));
  const max = Math.max(1, ...perDay.map((d) => d.n));
  const top = Math.max(1, steps.signed_in ?? 0, ...STEPS.map(([k]) => steps[k] ?? 0));
  return (
    <div className="flex flex-col gap-5" data-testid="insights">
      <TrackPageView event="settings_viewed" props={{ section: "insights" }} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-[15px] text-ink-2">
            All numbers come from our own database. Days and times are in business time ({zoneLabel}, <code>brand.timezone</code>).
          </p>
        </div>
        <nav aria-label="Date range" className="flex gap-1 rounded-[12px] bg-white p-1 shadow-sm">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Link key={k} href={`/settings/insights?range=${k}`} aria-current={k === range ? "page" : undefined} className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold ${k === range ? "bg-[#2b2b2b] text-white" : ""}`}>
              {RANGES[k]}
            </Link>
          ))}
        </nav>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((k) => (
          <li key={k.key} className="rounded-[18px] bg-white p-4 shadow-sm" data-testid={`kpi-${k.key}`}>
            <p className="text-[13px] font-semibold text-ink-2">{k.label}</p>
            <p className="mt-1 text-[28px] font-extrabold" data-testid="kpi-value">
              {k.value.toLocaleString("en-GB")}
            </p>
            {k.change !== null && (
              <p className={`text-[13px] font-bold ${k.change > 0 ? "text-[#1f6b35]" : k.change < 0 ? "text-danger" : "text-ink-2"}`}>
                {k.change > 0 ? "▲" : k.change < 0 ? "▼" : "•"} {Math.abs(k.change)}% vs previous ({k.previous})
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="perday">
          <h2 id="perday" className="text-[19px] font-extrabold">
            Cards per day
          </h2>
          <div className="mt-4 flex h-[180px] items-end gap-[3px]" role="img" aria-label={`Cards per day: ${perDay.map((d) => `${d.day} ${d.n}`).join(", ")}`} data-testid="cards-per-day">
            {perDay.map((d) => (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${d.day}: ${d.n}`}>
                {/* The day's value above its bar (hidden for 0 so long ranges stay readable). */}
                <span className={`mb-0.5 text-[11px] font-bold leading-none text-ink ${perDay.length > 14 ? "max-sm:hidden" : ""}`} aria-hidden="true" data-testid="bar-value">
                  {d.n > 0 ? d.n : ""}
                </span>
                <div className="w-full rounded-t-[3px] bg-primary-gradient" style={{ height: `${Math.max(2, (d.n / max) * 85)}%` }} />
              </div>
            ))}
          </div>
          <p className="mt-1 flex justify-between text-[12px] text-ink-2">
            <span>{perDay[0]?.day}</span>
            <span>{perDay[perDay.length - 1]?.day}</span>
          </p>
        </section>
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="funnel">
          <div className="flex items-baseline justify-between">
            <h2 id="funnel" className="text-[19px] font-extrabold">
              Card funnel (people)
            </h2>
            <a className="link text-[13px]" href={`${s["tracking.posthog_ui_host"]}/project/${s["tracking.posthog_project_id"]}/insights`}>
              Open in PostHog
            </a>
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {STEPS.map(([k, label]) => (
              <li key={k}>
                <div className="flex justify-between text-[14px]">
                  <span>{label}</span>
                  <strong>{steps[k] ?? 0}</strong>
                </div>
                <div className="mt-1 h-2 rounded-full bg-black/[0.06]">
                  <div className="h-full rounded-full bg-primary-gradient" style={{ width: `${((steps[k] ?? 0) / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="actions" data-testid="card-actions">
          <div className="flex items-baseline justify-between">
            <h2 id="actions" className="text-[19px] font-extrabold">
              What people did with their cards
            </h2>
            <span className="text-[13px] text-ink-2">{actions.made} made</span>
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {ACTIONS.map(([k, label]) => (
              <li key={k} data-testid={`action-${k}`}>
                <div className="flex justify-between gap-2 text-[14px]">
                  <span>{label}</span>
                  <span>
                    <strong>{actions[k].cards}</strong> <span className="text-ink-2">{actions[k].cards === 1 ? "card" : "cards"} · {actions[k].people} {actions[k].people === 1 ? "person" : "people"}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-black/[0.06]">
                  <div className="h-full rounded-full bg-primary-gradient" style={{ width: `${(actions[k].cards / actionTop) * 100}%` }} />
                </div>
              </li>
            ))}
            <li data-testid="action-not_yet">
              <div className="flex justify-between gap-2 text-[14px]">
                <span>Made, nothing done yet</span>
                <span>
                  <strong>{actions.not_yet}</strong> <span className="text-ink-2">{actions.not_yet === 1 ? "card" : "cards"}</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-black/[0.06]">
                <div className="h-full rounded-full bg-black/25" style={{ width: `${(actions.not_yet / actionTop) * 100}%` }} />
              </div>
            </li>
          </ol>
          <p className="mt-3 text-[12px] text-ink-2">A card can count in more than one row (e.g. downloaded and emailed).</p>
        </section>
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="arrivals" data-testid="arrivals">
          <h2 id="arrivals" className="text-[19px] font-extrabold">
            Where people came from
          </h2>
          <table className="mt-3 w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase text-ink-2">
                <th className="py-1.5">Link</th>
                <th className="text-right">Sent</th>
                <th className="text-right">Clicked</th>
                <th className="text-right">Signed in</th>
                <th className="text-right">Made a card</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line" data-testid="arrivals-offer_email">
                <td className="py-2 font-semibold">Free gift offer email</td>
                <td className="text-right">{arrivals.offer_email.sent}</td>
                <td className="text-right">
                  <strong>{arrivals.offer_email.clicked}</strong>
                  {arrivals.offer_email.sent > 0 && <span className="text-ink-2"> ({Math.round((arrivals.offer_email.clicked / arrivals.offer_email.sent) * 100)}%)</span>}
                </td>
                <td className="text-right text-ink-2">{arrivals.offer_email.clicked}</td>
                <td className="text-right">{arrivals.offer_email.cards}</td>
              </tr>
              {arrivals.links.map((l) => (
                <tr key={l.entry} className="border-b border-line" data-testid={`arrivals-${l.entry}`}>
                  <td className="py-2">
                    <span className="font-semibold">{l.entry === "invoice" ? "Invoice email link" : `Link “${l.entry}”`}</span>
                    <br />
                    <code className="text-[11px] text-ink-2">{env.appUrl}/from/{l.entry}</code>
                  </td>
                  <td className="text-right text-ink-2">–</td>
                  <td className="text-right">
                    <strong>{l.clicks}</strong>
                  </td>
                  <td className="text-right">{l.signed_in}</td>
                  <td className="text-right">{l.cards}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-ink-2">The offer email&apos;s button signs people in by itself, so its clicks are its sign-ins. A tracked link counts each click (repeat taps from one place count once an hour), then credits a sign-in within the hour. Add links in Settings › Tracking (tracking.entry_links).</p>
        </section>
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="themes">
          <h2 id="themes" className="text-[19px] font-extrabold">
            Top themes
          </h2>
          <ol className="mt-3 flex flex-col gap-1 text-[14px]">
            {themes.map((t) => (
              <li key={`${t.theme}-${t.version}`} className="flex justify-between border-b border-line py-1.5">
                <span>
                  {t.theme} · {t.version}
                </span>
                <strong>{t.n}</strong>
              </li>
            ))}
            {!themes.length && <li className="text-ink-2">No cards in this period.</li>}
          </ol>
        </section>
        <section className="rounded-[20px] bg-white p-5 shadow-sm" aria-labelledby="feed">
          <h2 id="feed" className="text-[19px] font-extrabold">
            Live feed
          </h2>
          <ol className="mt-3 flex flex-col gap-1 text-[13px]">
            {feed.map((f) => (
              <li key={f.id} className="flex justify-between gap-2 border-b border-line py-1">
                <span className="font-mono">{f.event}</span>
                <span className="truncate text-ink-2">
                  {f.ref_type ? `${f.ref_type}:${f.ref_id} · ` : ""}
                  {fmtBiz(f.occurred_at, tz, "time")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
