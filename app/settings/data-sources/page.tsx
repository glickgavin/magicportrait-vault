import { sourceStatuses } from "@/lib/admin/sources";
import { outboxStats } from "@/lib/klaviyo";
import { DataSourcesCard } from "@/components/admin/DataSourcesCard";
import { KlaviyoRetry } from "@/components/admin/KlaviyoRetry";
import { TrackPageView } from "@/components/TrackPageView";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data sources" };

export default async function DataSourcesPage() {
  const [sources, stats, enabled, revision] = await Promise.all([sourceStatuses(), outboxStats(7), getSetting("klaviyo.enabled"), getSetting("klaviyo.api_revision")]);
  const rows = Object.entries(stats).sort();
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "data_sources" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Data sources</h1>
      <p className="text-[15px] text-ink-2">Each test does one harmless read and records only counts and timings.</p>
      <div className="mt-5">
        <DataSourcesCard sources={sources} full />
      </div>
      <section className="mt-5 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="kl-title" data-testid="klaviyo-card">
        <div className="flex items-center justify-between">
          <h2 id="kl-title" className="text-[19px] font-extrabold">
            Klaviyo outbox
          </h2>
          <KlaviyoRetry />
        </div>
        <p className="text-[14px] text-ink-2">
          Sending is {enabled ? "on" : "off (rows are recorded as skipped)"} · API revision {revision} · last 7 days
        </p>
        <table className="mt-3 w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12px] uppercase text-ink-2">
              <th className="py-2">Event</th>
              <th>Sent</th>
              <th>Pending</th>
              <th>Failed</th>
              <th>Skipped</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, c]) => (
              <tr key={name} className="border-b border-line">
                <td className="py-2 font-mono text-[13px]">{name}</td>
                <td>{c.sent ?? 0}</td>
                <td>{c.pending ?? 0}</td>
                <td className={c.failed ? "font-bold text-danger" : ""}>{c.failed ?? 0}</td>
                <td>{c.skipped ?? 0}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-3 text-ink-2">
                  Nothing in the last 7 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
