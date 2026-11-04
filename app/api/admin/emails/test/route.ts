import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { emailSender } from "@/lib/email";
import { emailFooter } from "@/lib/email/footer";
import { previewProps, renderEmail, TEMPLATES } from "@/lib/email/render";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const body = z.object({ template: z.enum(Object.keys(TEMPLATES) as [keyof typeof TEMPLATES, ...(keyof typeof TEMPLATES)[]]) });

/** "Send me a test": sends a template with sample data to the super user's own address. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const s = await getSettings(["email.from_system", "email.reply_to"] as const);
  const { subject, html, text } = await renderEmail(p.data.template, { ...previewProps(p.data.template), footer: await emailFooter() } as never);
  const r = await emailSender().send({ from: s["email.from_system"], to: u.email, replyTo: s["email.reply_to"], subject: `[Test] ${subject}`, html, text });
  return r.ok ? json({ ok: true, provider: emailSender().kind }) : json({ error: r.error }, 502);
}
