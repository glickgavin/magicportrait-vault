import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { loadHome } from "@/lib/vault/home";
import { HomeTabs } from "@/components/vault/HomeTabs";
import { SessionCard } from "@/components/vault/SessionCard";
import { PortraitFilter, type Filter } from "@/components/vault/PortraitFilter";
import { TrackPageView } from "@/components/TrackPageView";
import { TrackedLink } from "@/components/TrackedLink";
import { EmptyHome } from "@/components/screens/home/EmptyHome";
import { PartialNotice } from "@/components/screens/home/PartialNotice";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("portraits.title") };

export default async function PortraitsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser("/portraits");
  const sp = await searchParams;
  const filter: Filter = sp.filter === "ordered" || sp.filter === "not_ordered" ? sp.filter : "all";
  const data = await loadHome(user.email);
  const { profile } = data;
  const partial = profile.unavailable.length > 0;
  if (profile.state === "nobody" && partial) return <PartialNotice />;
  if (profile.state === "nobody") return <EmptyHome startPortraitUrl={data.startPortraitUrl} mirrorSince={data.mirrorSince} />;
  const groups = profile.sessions.filter((g) => (filter === "ordered" ? g.portraits.some((p) => p.ordered) : filter === "not_ordered" ? g.portraits.some((p) => !p.ordered) : true));
  const oldest = profile.sessions.map((s) => s.createdAt).sort()[0];
  const nothingOlder = !oldest || oldest.slice(0, 10) >= data.mirrorSince;
  return (
    <div className="mx-auto max-w-[640px]" data-testid="portraits-page">
      {partial && <PartialNotice />}
      <TrackPageView event="page_view_vault_portraits" props={{ session_count: profile.sessions.length, portrait_count: profile.portraitCount, ordered_count: profile.orderedCount }} />
      {profile.hasFreeGift && <HomeTabs active="portraits" />}
      <h1 className="mt-5 text-[28px] font-extrabold tracking-tight">{t("portraits.title")}</h1>
      <p className="text-[15px] text-ink-2">{t("portraits.summary", { sessions: profile.sessions.length, portraits: profile.portraitCount, ordered: profile.orderedCount })}</p>
      <div className="mt-4">
        <PortraitFilter value={filter} />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {groups.length === 0 && <p className="rounded-[16px] bg-white p-5 text-center text-ink-2">{t("portraits.none")}</p>}
        {groups.map((g) => (
          <SessionCard key={g.sessionId} group={g} filter={filter} canMakeCard={data.access.allowed} />
        ))}
      </div>
      <TrackedLink
        href={data.startPortraitUrl}
        event="vault_new_portrait_tapped"
        className="mt-5 flex h-14 items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-black/15 text-[16px] font-bold hover:bg-white/50"
      >
        <Plus className="h-5 w-5 text-magenta" aria-hidden="true" /> {t("portraits.createNew")}
      </TrackedLink>
      {nothingOlder && <p className="mt-4 text-center text-[13px] text-ink-2">{t("portraits.olderNote", { date: fmtDate(data.mirrorSince) })}</p>}
    </div>
  );
}
