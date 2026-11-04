import { db } from "@/lib/db/client";
import { settingRows } from "@/lib/admin/data";
import { previewProps, renderEmail, TEMPLATES } from "@/lib/email/render";
import { emailSender } from "@/lib/email";
import { SettingsTable } from "@/components/admin/SettingsTable";
import { SettingField } from "@/components/admin/SettingField";
import { giftOfferEmailStats } from "@/lib/gift/offers";
import { SendTestButton } from "@/components/admin/EmailTools";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails" };

const NAMES: Record<string, string> = { "card-delivery": "Card to the recipient", "card-scheduled": "Scheduled card confirmation (to the sender)", "signin-code": "Sign-in code (Supabase Auth via AgentMail SMTP)", "signin-link": "Resent sign-in link", "gift-offer": "Free gift offer (after a paid order)" };
const OFFER_KEYS = ["gift.offer_email_enabled", "gift.offer_email_channel", "gift.offer_email_subject", "gift.offer_email_delay_minutes", "gift.link_valid_days"];

export default async function EmailsPage() {
  const all = await settingRows();
  const rows = all.filter((r) => r.section === "email" || r.key === "cards.email_sender_name");
  const offerRows = OFFER_KEYS.map((k) => all.find((r) => r.key === k)!).filter(Boolean);
  const [stats30, statsAll] = await Promise.all([giftOfferEmailStats(30), giftOfferEmailStats(3650)]);
  const previews = await Promise.all((Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map(async (n) => ({ name: n, ...(await renderEmail(n, previewProps(n) as never)) })));
  const sup = ((await db().from("email_suppressions").select("email, scope, reason, created_at").order("created_at", { ascending: false }).limit(200)).data ?? []) as { email: string; scope: string; reason: string; created_at: string }[];
  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "emails" }} />
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Emails</h1>
        <p className="text-[15px] text-ink-2">
          AgentMail sends sign-in codes, cards to recipients and confirmations. Sender: <code>cards@magicportraitspartners.com</code> · mode: <strong>{emailSender().kind}</strong>. The free gift offer is sent from here too (or by Klaviyo, per its channel setting). Reminder and mug-photo emails will be Klaviyo flows.
        </p>
      </div>
      <SettingsTable rows={rows} sections={["email", "cards"]} />
      <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="offer-email">
        <h2 className="text-[19px] font-extrabold">Free gift offer email</h2>
        <p className="text-[13px] text-ink-2">
          Sent after a qualifying paid order (needs the Shopify <code>orders/paid</code> webhook). &ldquo;Clicked&rdquo; is the first use of its one-tap link; &ldquo;cards made&rdquo; counts customers who made a card after it was sent.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {offerRows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 rounded-[14px] bg-black/[0.03] p-3">
              <span className="min-w-0 text-[14px]">
                <span className="font-semibold">{r.label}</span>
                <br />
                <code className="text-[11px] text-ink-2">{r.key}</code>
              </span>
              <SettingField row={r} />
            </li>
          ))}
        </ul>
        <table className="mt-4 w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12px] uppercase text-ink-2">
              <th className="py-2"></th>
              <th>Sent</th>
              <th>Delivered</th>
              <th>Bounced</th>
              <th>Failed</th>
              <th>Clicked</th>
              <th>Cards made</th>
            </tr>
          </thead>
          <tbody>
            {[["Last 30 days", stats30] as const, ["All time", statsAll] as const].map(([label, st]) => (
              <tr key={label} className="border-b border-line">
                <td className="py-1.5 font-semibold">{label}</td>
                <td>{st.sent}</td>
                <td>{st.delivered}</td>
                <td>{st.bounced}</td>
                <td>{st.failed}</td>
                <td>
                  {st.clicked}
                  {st.sent ? <span className="text-ink-2"> ({Math.round((st.clicked / st.sent) * 100)}%)</span> : null}
                </td>
                <td>{st.cardsMade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <h2 className="text-[19px] font-extrabold">Templates</h2>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          {previews.map((p) => (
            <div key={p.name} className="rounded-[14px] border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{NAMES[p.name]}</p>
                  <p className="text-[13px] text-ink-2">Subject: {p.subject}</p>
                </div>
                <SendTestButton template={p.name} />
              </div>
              <iframe title={`${NAMES[p.name]} preview`} srcDoc={p.html} sandbox="" className="mt-3 h-[520px] w-full rounded-[10px] border border-line bg-white" />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <h2 className="text-[19px] font-extrabold">Bounces and unsubscribes</h2>
        <table className="mt-3 w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12px] uppercase text-ink-2">
              <th className="py-2">Email</th>
              <th>Scope</th>
              <th>Reason</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {sup.map((s) => (
              <tr key={`${s.email}-${s.scope}`} className="border-b border-line">
                <td className="py-1.5">{s.email}</td>
                <td>{s.scope === "card_emails" ? "Card emails" : s.scope === "offer_emails" ? "Offer emails" : "All"}</td>
                <td>{s.reason}</td>
                <td>{new Date(s.created_at).toLocaleDateString("en-GB")}</td>
              </tr>
            ))}
            {!sup.length && (
              <tr>
                <td colSpan={4} className="py-3 text-ink-2">
                  None.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
