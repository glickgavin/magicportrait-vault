import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/auth/session";
import { getMemberById } from "@/lib/db/members";
import { countCardsBySender } from "@/lib/db/cards";
import { customerTimeline, emailHash } from "@/lib/admin/customers";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";
import { CustomerTimeline } from "@/components/admin/CustomerTimeline";
import { CustomerActions } from "@/components/admin/CustomerActions";
import { Avatar } from "@/components/Avatar";
import { initialsFor } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireSuperUser();
  const m = await getMemberById((await params).id);
  if (!m) notFound();
  const [{ items, profile }, cards, s, sup, suppressed] = await Promise.all([
    customerTimeline(m.email),
    countCardsBySender(m.email),
    getSettings(["tracking.posthog_project_id", "tracking.posthog_ui_host"] as const),
    db().rpc("is_super_user", { p_email: m.email }),
    db().from("email_suppressions").select("scope").eq("email", m.email),
  ]);
  await track("admin_customer_viewed", { customer_email_hash: emailHash(m.email) }, { email: u.email, actor: `super_user:${u.email}`, ref: { type: "customer", id: m.id } });
  const spent = profile.rawOrders.filter((o) => !o.cancelledAt && o.total).reduce((n, o) => n + Number(o.total!.amount), 0);
  const currency = profile.rawOrders.find((o) => o.total)?.total?.currency ?? "USD";
  const shopHandle = (env.optional("SHOPIFY_STORE_DOMAIN") ?? "").replace(".myshopify.com", "");
  const customerLegacy = profile.shopifyCustomerId?.split("/").pop();
  const badges = [profile.isCustomer ? "Customer" : profile.portraitCount ? "Creator" : "Nobody found", profile.hasFreeGift && "Free gift", sup.data === true && "Super user", (suppressed.data ?? []).length > 0 && "Emails blocked", m.created_via === "admin_lookup" && "Looked up"].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-5" data-testid="customer-page">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar initials={initialsFor(m.display_name, m.email)} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-extrabold tracking-tight">{m.display_name ?? m.email}</h1>
          <p className="text-[14px] text-ink-2">{m.email}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b} className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[12px] font-bold">
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Orders", profile.orders.length],
          ["Spent", `${spent.toFixed(2)} ${currency}`],
          ["Cards", cards],
          ["Portraits", profile.portraitCount],
        ].map(([l, v]) => (
          <li key={l as string} className="rounded-[16px] bg-white p-4 shadow-sm">
            <p className="text-[13px] font-semibold text-ink-2">{l}</p>
            <p className="text-[24px] font-extrabold">{v}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3 text-[14px]">
        <a className="link" href={`${s["tracking.posthog_ui_host"]}/project/${s["tracking.posthog_project_id"]}/person/${encodeURIComponent(m.email)}`}>
          Open in PostHog (replays)
        </a>
        {shopHandle && customerLegacy && (
          <a className="link" href={`https://admin.shopify.com/store/${shopHandle}/customers/${customerLegacy}`}>
            Open in Shopify
          </a>
        )}
      </div>
      <CustomerActions id={m.id} email={m.email} />
      <CustomerTimeline items={items} />
    </div>
  );
}
