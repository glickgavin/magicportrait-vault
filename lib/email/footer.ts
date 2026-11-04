import "server-only";
import { getSettings } from "@/lib/settings";
import type { EmailFooter } from "@/emails/Layout";

/** The footer band of every email, from settings (Settings › Emails). */
export async function emailFooter(): Promise<EmailFooter> {
  const s = await getSettings(["email.footer_company", "email.footer_address", "email.chat_url", "email.privacy_url"] as const);
  return { company: s["email.footer_company"], address: s["email.footer_address"], chatUrl: s["email.chat_url"], privacyUrl: s["email.privacy_url"] };
}
