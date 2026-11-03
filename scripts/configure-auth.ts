// Sets magic-vault's Auth for 6-digit email codes through the Management API (BUILD.md Part 4).
// Leaves SMTP alone: Gavin sets it, because it holds the AgentMail key.
// Run: pnpm auth:configure [--dry-run]
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) throw new Error("SUPABASE_PROJECT_REF is not set");
const template = readFileSync(new URL("../supabase/templates/signin-code.html", import.meta.url), "utf8");
if (!template.includes("{{ .Token }}")) throw new Error("template must show {{ .Token }}");

const body = {
  site_url: "https://my.magicportraits.ai",
  uri_allow_list: ["https://my.magicportraits.ai/**", "https://magic-vault-*-storyboards.vercel.app/**", "https://*-storyboards.vercel.app/**"].join(","),
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
  external_email_enabled: true,
  mailer_subjects_magic_link: "Your My Magic Portraits code",
  mailer_templates_magic_link_content: template,
  mailer_subjects_confirmation: "Your My Magic Portraits code",
  mailer_templates_confirmation_content: template,
};

if (process.argv.includes("--dry-run")) {
  console.log(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" && v.length > 80 ? `${v.length} chars` : v])));
} else {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  const d = JSON.parse(text) as Record<string, unknown>;
  console.log({
    site_url: d.site_url,
    mailer_otp_length: d.mailer_otp_length,
    mailer_otp_exp: d.mailer_otp_exp,
    uri_allow_list: d.uri_allow_list,
    template_has_token: String(d.mailer_templates_magic_link_content).includes("{{ .Token }}"),
  });
}
