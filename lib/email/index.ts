import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type OutgoingEmail = { from: string; to: string; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey?: string };
export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

export interface EmailSender {
  readonly kind: "agentmail" | "fixtures";
  send(m: OutgoingEmail): Promise<SendResult>;
  check(): Promise<Record<string, string | number | boolean>>;
}

/** The address part of "Name <addr>". */
export function addressOf(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

/** Records instead of sending (tests, local dev, previews without a key). One JSON file per message. */
class FixtureSender implements EmailSender {
  readonly kind = "fixtures" as const;
  async send(m: OutgoingEmail): Promise<SendResult> {
    const id = `fx-${randomUUID()}`;
    const dir = process.env.EMAIL_OUTBOX_DIR || path.join(process.cwd(), ".tmp/sent-emails");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${Date.now()}-${id}.json`), JSON.stringify({ id, ...m, sentAt: new Date().toISOString() }, null, 2));
    return { ok: true, messageId: id };
  }
  async check() {
    return { mode: "fixtures", ok: true };
  }
}

class AgentMailSender implements EmailSender {
  readonly kind = "agentmail" as const;
  constructor(private apiKey: string) {}
  private async client() {
    const { AgentMailClient } = await import("agentmail");
    return new AgentMailClient({ apiKey: this.apiKey });
  }
  async send(m: OutgoingEmail): Promise<SendResult> {
    try {
      const c = await this.client();
      // The inbox id is its address. AgentMail's API sends as the inbox; the display name is the inbox's.
      const res = await c.inboxes.messages.send(
        addressOf(m.from),
        { to: [m.to], subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo ? [m.replyTo] : undefined, headers: m.headers },
        m.idempotencyKey ? { idempotencyKey: m.idempotencyKey } : undefined,
      );
      return { ok: true, messageId: res.messageId };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false, error: `agentmail_${status ?? "error"}` };
    }
  }
  async check() {
    const c = await this.client();
    const inbox = await c.inboxes.get("cards@magicportraitspartners.com").catch(() => null);
    return { mode: "agentmail", inbox_found: Boolean(inbox), ok: Boolean(inbox) };
  }
}

export function emailSender(): EmailSender {
  const key = env.optional("AGENTMAIL_API_KEY");
  if (process.env.EMAIL_PROVIDER === "fixtures" || !key) return new FixtureSender();
  return new AgentMailSender(key);
}
