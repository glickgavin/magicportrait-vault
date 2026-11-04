import { CustomerSearch } from "@/components/admin/CustomerSearch";
import { TrackPageView } from "@/components/TrackPageView";

export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "customers" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Customers</h1>
      <p className="mb-4 text-[15px] text-ink-2">Search by email or name. Customer pages use an opaque id, never the email.</p>
      <CustomerSearch />
    </div>
  );
}
