import { settingRows } from "@/lib/admin/data";
import { SettingsTable } from "@/components/admin/SettingsTable";
import { OrderLookup } from "@/components/admin/EmailTools";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Downloads & mugs" };

export default async function RedeemSettingsPage() {
  const rows = await settingRows();
  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "redeem" }} />
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Downloads &amp; mugs</h1>
        <p className="text-[15px] text-ink-2">The rules and constants of the rebuilt /redeem (docs/data.md §4, §6), with validation.</p>
      </div>
      <OrderLookup />
      <SettingsTable rows={rows} sections={["redeem"]} />
    </div>
  );
}
