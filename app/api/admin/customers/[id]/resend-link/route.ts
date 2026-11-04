import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { getMemberById } from "@/lib/db/members";
import { createSigninLink } from "@/lib/auth/links";
import { emailSender } from "@/lib/email";
import { renderEmail } from "@/lib/email/render";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { firstName } from "@/lib/utils";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

/** Resend sign-in link: a fresh one-tap link, emailed by AgentMail. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const m = await getMemberById((await ctx.params).id);
  if (!m) return json({ error: "not_found" }, 404);
  const s = await getSettings(["gift.link_valid_days", "email.from_system", "email.reply_to"] as const);
  const link = await createSigninLink({ email: m.email, purpose: "admin_resend", validDays: s["gift.link_valid_days"], redirectPath: "/", createdBy: u.email });
  const mail = await renderEmail("signin-link", { appUrl: env.appUrl, link: link.url, days: s["gift.link_valid_days"], firstName: firstName(m.display_name) });
  const r = await emailSender().send({ from: s["email.from_system"], to: m.email, replyTo: s["email.reply_to"], ...mail });
  if (!r.ok) return json({ error: "send_failed" }, 502);
  await track("admin_signin_link_resent", { customer_id: m.id }, { email: u.email, actor: actorOf(u), ref: { type: "customer", id: m.id } });
  return json({ ok: true });
}
