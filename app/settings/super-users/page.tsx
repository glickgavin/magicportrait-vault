import { requireSuperUser } from "@/lib/auth/session";
import { superUsers } from "@/lib/admin/data";
import { SuperUsersCard } from "@/components/admin/SuperUsersCard";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Super users" };

export default async function SuperUsersPage() {
  const user = await requireSuperUser();
  return (
    <div className="max-w-xl">
      <TrackPageView event="settings_viewed" props={{ section: "super_users" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Super users</h1>
      <p className="mb-5 text-[15px] text-ink-2">Super users can open Settings, see every card and read card messages for support. You can&apos;t remove yourself or the last one.</p>
      <SuperUsersCard users={await superUsers()} me={user.email} />
    </div>
  );
}
