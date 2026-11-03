import { Suspense } from "react";
import { db } from "@/lib/db/client";
import { AdminCards } from "@/components/admin/AdminCards";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "All cards" };

export default async function AllCardsPage() {
  const cats = ((await db().from("theme_categories").select("slug, name").order("sort_order")).data ?? []) as { slug: string; name: string }[];
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "cards" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">All cards</h1>
      <p className="mb-4 text-[15px] text-ink-2">Every card ever made. Cards are kept forever and only removed on a deletion request.</p>
      <Suspense>
        <AdminCards categories={cats} />
      </Suspense>
    </div>
  );
}
