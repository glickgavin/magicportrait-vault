import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity log" };

type SP = Promise<{ email?: string; event?: string; source?: string; actor?: string; before?: string }>;

/** The full activity log, filterable by email, event, source and who did it. The email filter travels in a cookie, never the URL. */
export default async function ActivityPage({ searchParams }: { searchParams: SP }) {
  const sp = { ...(await searchParams), email: (await cookies()).get("vault_activity_email")?.value || undefined };
  let q = db().from("activity_log").select("id, occurred_at, email, event, source, ref_type, ref_id, props, actor").order("id", { ascending: false }).limit(100);
  if (sp.event) q = q.eq("event", sp.event);
  if (sp.source) q = q.eq("source", sp.source);
  if (sp.actor) q = q.ilike("actor", `%${sp.actor.replace(/[%_]/g, "")}%`);
  if (sp.email) q = q.ilike("email", `%${sp.email.replace(/[%_]/g, "").toLowerCase()}%`);
  if (sp.before && /^\d+$/.test(sp.before)) q = q.lt("id", Number(sp.before));
  const rows = ((await q).data ?? []) as { id: number; occurred_at: string; email: string | null; event: string; source: string; ref_type: string | null; ref_id: string | null; props: object; actor: string }[];
  const last = rows[rows.length - 1];
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "activity" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Activity log</h1>
      <form method="post" action="/settings/activity/filter" className="mt-4 flex flex-wrap gap-2 rounded-[16px] bg-white p-3 shadow-sm">
        {(["email", "event", "source", "actor"] as const).map((f) => (
          <label key={f} className="flex flex-col text-[12px] font-semibold capitalize">
            {f}
            <input name={f} defaultValue={sp[f] ?? ""} className="h-10 rounded-[10px] border border-line px-2 text-[14px] font-normal" />
          </label>
        ))}
        <button type="submit" className="h-10 self-end rounded-[10px] bg-[#2b2b2b] px-4 font-bold text-white">
          Filter
        </button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-[20px] bg-white p-3 shadow-sm">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase text-ink-2">
              <th className="py-2">When</th>
              <th>Event</th>
              <th>Email</th>
              <th>Source</th>
              <th>Ref</th>
              <th>Props</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top">
                <td className="whitespace-nowrap py-1.5 pr-2">{new Date(r.occurred_at).toLocaleString("en-GB")}</td>
                <td className="pr-2 font-mono">{r.event}</td>
                <td className="pr-2">{r.email ?? "—"}</td>
                <td className="pr-2">{r.source}</td>
                <td className="pr-2">{r.ref_type ? `${r.ref_type}:${r.ref_id}` : ""}</td>
                <td className="max-w-[260px] truncate pr-2 font-mono text-[12px]">{JSON.stringify(r.props)}</td>
                <td>{r.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {last && rows.length === 100 && (
          <Link className="link mt-3 inline-block text-[14px]" href={`/settings/activity?${new URLSearchParams({ ...(sp.event ? { event: sp.event } : {}), ...(sp.source ? { source: sp.source } : {}), before: String(last.id) })}`}>
            Older
          </Link>
        )}
      </div>
    </div>
  );
}
