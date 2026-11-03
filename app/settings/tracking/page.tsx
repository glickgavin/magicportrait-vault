import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db/client";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracking (PostHog)" };

async function posthogCounts(projectId: string): Promise<{ event: string; n: number }[] | null> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://us.posthog.com/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: "select event, count() as n from events where timestamp > now() - interval 1 day and properties.app = 'vault' group by event order by n desc limit 30" } }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const b = (await res.json()) as { results?: [string, number][] };
  return (b.results ?? []).map(([event, n]) => ({ event, n }));
}

function dayAgo() {
  return new Date(Date.now() - 86_400_000).toISOString();
}

export default async function TrackingPage() {
  const s = await getSettings(["tracking.posthog_project_id", "tracking.posthog_ui_host"] as const);
  const counts = await posthogCounts(s["tracking.posthog_project_id"]);
  const local = ((await db().from("activity_log").select("event").gte("occurred_at", dayAgo()).limit(5000)).data ?? []) as { event: string }[];
  const byEvent = Object.entries(local.reduce<Record<string, number>>((m, r) => ((m[r.event] = (m[r.event] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const base = `${s["tracking.posthog_ui_host"]}/project/${s["tracking.posthog_project_id"]}`;
  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "tracking" }} />
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Tracking (PostHog)</h1>
        <p className="text-[15px] text-ink-2">
          Project {s["tracking.posthog_project_id"]}, the same as magicportraits.ai. Browser events go through the <code>/ingest</code> proxy; key {process.env.NEXT_PUBLIC_POSTHOG_KEY ? "set" : "not set"}.
        </p>
      </div>
      <section className="rounded-[20px] bg-white p-5 shadow-sm">
        <h2 className="text-[19px] font-extrabold">Links</h2>
        <ul className="mt-2 flex flex-wrap gap-3 text-[15px]">
          <li><a className="link" href={`${base}/dashboard`}>Dashboards</a></li>
          <li><a className="link" href={`${base}/replay/home`}>Session replays</a></li>
          <li><a className="link" href={`${base}/activity/explore`}>Live events</a></li>
          <li><a className="link" href={`${base}/insights`}>Insights and funnels</a></li>
        </ul>
      </section>
      <section className="rounded-[20px] bg-white p-5 shadow-sm">
        <h2 className="text-[19px] font-extrabold">Last 24 hours</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <div>
            <p className="font-bold">PostHog (app = vault)</p>
            {counts ? (
              <ul className="mt-1 text-[14px]">{counts.map((c) => <li key={c.event}><code>{c.event}</code> · {c.n}</li>)}</ul>
            ) : (
              <p className="text-[14px] text-ink-2">Add POSTHOG_PERSONAL_API_KEY in Vercel to show counts here.</p>
            )}
          </div>
          <div>
            <p className="font-bold">Activity log (business events)</p>
            <ul className="mt-1 text-[14px]">{byEvent.map(([e, n]) => <li key={e}><code>{e}</code> · {n}</li>)}</ul>
          </div>
        </div>
      </section>
    </div>
  );
}
