import { db } from "@/lib/db/client";
import { settingRows } from "@/lib/admin/data";
import { previewProps, renderEmail, TEMPLATES } from "@/lib/email/render";
import { emailSender } from "@/lib/email";
import { SettingsTable } from "@/components/admin/SettingsTable";
import { SendTestButton } from "@/components/admin/EmailTools";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails" };

const NAMES: Record<string, string> = { "card-delivery": "Card to the recipient", "card-scheduled": "Scheduled card confirmation (to the sender)", "signin-code": "Sign-in code (Supabase Auth via AgentMail SMTP)", "signin-link": "Resent sign-in link" };

export default async function EmailsPage() {
  const rows = (await settingRows()).filter((r) => r.section === "email" || r.key === "cards.email_sender_name");
  const previews = await Promise.all((Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map(async (n) => ({ name: n, ...(await renderEmail(n, previewProps(n) as never)) })));
  const sup = ((await db().from("email_suppressions").select("email, scope, reason, created_at").order("created_at", { ascending: false }).limit(200)).data ?? []) as { email: string; scope: string; reason: string; created_at: string }[];
  return (
    <div className="flex flex-col gap-5">
      <TrackPageView event="settings_viewed" props={{ section: "emails" }} />
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Emails</h1>
        <p className="text-[15px] text-ink-2">
          AgentMail sends sign-in codes, cards to recipients and confirmations. Sender: <code>cards@magicportraitspartners.com</code> · mode: <strong>{emailSender().kind}</strong>. Offer, reminder and mug-photo emails will be Klaviyo flows.
        </p>
      </div>
      <SettingsTable rows={rows} sections={["email", "cards"]} />
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
                <td>{s.scope === "card_emails" ? "Card emails" : "All"}</td>
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
