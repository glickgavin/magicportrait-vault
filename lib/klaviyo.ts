import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import type { OutboxInput } from "@/lib/track";

/** The fixed property list per event (SPEC §14a). Nothing else is ever sent: no message text, no recipient details. */
export const KLAVIYO_PROPS: Record<string, readonly string[]> = {
  free_gift_unlocked: ["order_name", "card_link", "link_expires_at", "portrait_image_url", "suggested_design"],
  vault_signed_in: ["method"],
  card_created: ["card_id", "theme_name", "category", "delivery", "scheduled", "cards_created_total", "first_card"],
  card_email_sent: ["card_id", "theme_name"],
  card_recipient_email_opened: ["card_id"],
  free_gift_link_requested: ["order_name", "card_link", "link_expires_at"],
  gift_reminder_due: ["category", "suggested_design", "card_link"],
  mug_photo_needed: ["order_name", "order_link", "portrait_count"],
  redeem_mug_saved: ["order_name"],
};
const LINK_PROPS = new Set(["card_link", "order_link"]);

export const PROFILE_PROPS = ["My MP Has Free Gift", "My MP Cards Created", "My MP Last Card At", "My MP Portraits", "My MP Mug Photo Needed"] as const;
export type ProfileProps = Partial<Record<(typeof PROFILE_PROPS)[number], string | number | boolean | null>>;

type KSettings = { enabled: boolean; events: string[]; includeLink: boolean; profileProps: boolean };

async function ksettings(): Promise<KSettings> {
  const s = await getSettings(["klaviyo.enabled", "klaviyo.events", "klaviyo.include_signin_link", "klaviyo.profile_properties"] as const);
  return { enabled: s["klaviyo.enabled"], events: s["klaviyo.events"], includeLink: s["klaviyo.include_signin_link"], profileProps: s["klaviyo.profile_properties"] };
}

/**
 * The outbox row for a Klaviyo event, or null when this event isn't sent to Klaviyo.
 * With klaviyo.enabled off the row is written as `skipped` (visible in Settings, never sent).
 */
export async function klaviyoEventOutbox(event: string, props: Record<string, unknown>, email: string, extra: Record<string, unknown> = {}, dedupeKey?: string | null): Promise<OutboxInput | null> {
  const list = KLAVIYO_PROPS[event];
  if (!list) return null;
  const s = await ksettings();
  if (!s.events.includes(event)) return null;
  const merged = { ...props, ...extra };
  const properties: Record<string, unknown> = {};
  for (const k of list) {
    if (LINK_PROPS.has(k) && !s.includeLink) continue;
    if (merged[k] !== undefined && merged[k] !== null) properties[k] = merged[k];
  }
  return {
    kind: "event",
    dedupe_key: dedupeKey ?? null,
    email,
    event_name: event,
    status: s.enabled ? "pending" : "skipped",
    payload: {
      data: {
        type: "event",
        attributes: {
          metric: { data: { type: "metric", attributes: { name: event } } },
          profile: { data: { type: "profile", attributes: { email } } },
          properties,
          time: new Date().toISOString(),
        },
      },
    },
  };
}

/** Queues a profile property update (only the five My MP properties). */
export async function queueProfileUpdate(email: string, props: ProfileProps): Promise<string | null> {
  const s = await ksettings();
  if (!s.profileProps) return null;
  const properties: Record<string, unknown> = {};
  for (const k of PROFILE_PROPS) if (props[k] !== undefined) properties[k] = props[k];
  if (!Object.keys(properties).length) return null;
  const r = await db()
    .from("outbound_events")
    .insert({ kind: "profile", email: email.toLowerCase(), event_name: "profile", status: s.enabled ? "pending" : "skipped", payload: { data: { type: "profile", attributes: { email: email.toLowerCase(), properties } } } })
    .select("id")
    .single();
  const id = (r.data as { id: string } | null)?.id ?? null;
  if (id && s.enabled) await flushRow(id).catch(() => undefined);
  return id;
}

export async function queueDeletion(email: string): Promise<void> {
  const s = await getSettings(["klaviyo.enabled", "klaviyo.delete_on_request"] as const);
  if (!s["klaviyo.delete_on_request"]) return;
  await db()
    .from("outbound_events")
    .insert({
      kind: "deletion",
      email: null,
      event_name: "data_privacy_deletion",
      status: s["klaviyo.enabled"] ? "pending" : "skipped",
      payload: { data: { type: "data-privacy-deletion-job", attributes: { profile: { data: { type: "profile", attributes: { email: email.toLowerCase() } } } } } },
    });
}

// ------------------------------------------------------------------ transport

type Row = { id: string; kind: "event" | "profile" | "deletion"; payload: Record<string, unknown>; attempts: number; status: string; event_name: string | null };
export type SendOutcome = { ok: true; status: number } | { ok: false; status: number; retryAfterMs?: number; permanent: boolean; error: string };

const ENDPOINT = { event: "events/", profile: "profile-import/", deletion: "data-privacy-deletion-jobs/" } as const;

export interface KlaviyoTransport {
  readonly kind: "live" | "fixtures";
  post(path: string, body: unknown, revision: string): Promise<SendOutcome>;
}

class LiveTransport implements KlaviyoTransport {
  readonly kind = "live" as const;
  constructor(private key: string) {}
  async post(p: string, body: unknown, revision: string): Promise<SendOutcome> {
    try {
      const res = await fetch(`https://a.klaviyo.com/api/${p}`, {
        method: "POST",
        headers: { authorization: `Klaviyo-API-Key ${this.key}`, revision, "content-type": "application/vnd.api+json", accept: "application/vnd.api+json" },
        body: JSON.stringify(body),
      });
      if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
      const retryAfter = Number(res.headers.get("retry-after"));
      const text = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, status: res.status, retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined, permanent: res.status >= 400 && res.status < 500 && res.status !== 429, error: text };
    } catch (e) {
      return { ok: false, status: 0, permanent: false, error: (e as Error).message.slice(0, 200) };
    }
  }
}

/** Records instead of sending. Tests can make it fail with KLAVIYO_FIXTURE_FAIL=<status>. */
class FixtureTransport implements KlaviyoTransport {
  readonly kind = "fixtures" as const;
  async post(p: string, body: unknown): Promise<SendOutcome> {
    const fail = Number(process.env.KLAVIYO_FIXTURE_FAIL || 0);
    if (fail) return { ok: false, status: fail, permanent: fail >= 400 && fail < 500 && fail !== 429, error: "fixture failure" };
    const dir = process.env.KLAVIYO_OUTBOX_DIR || path.join(tmpdir(), "magic-vault", "klaviyo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.json`), JSON.stringify({ path: p, body }, null, 2));
    return { ok: true, status: 202 };
  }
}

export function klaviyoTransport(): KlaviyoTransport | null {
  if (process.env.KLAVIYO_PROVIDER === "fixtures") return new FixtureTransport();
  const key = env.optional("KLAVIYO_PRIVATE_KEY");
  return key ? new LiveTransport(key) : null;
}

/** Backoff: 1, 2, 4, 8 … minutes, capped at 6 hours. */
export function backoffMs(attempts: number): number {
  return Math.min(6 * 3600_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}

/** Sends one outbox row now. Klaviyo being down never throws to the caller. */
export async function flushRow(id: string, now = new Date()): Promise<"sent" | "failed" | "retry" | "skipped"> {
  const r = await db().from("outbound_events").select("id, kind, payload, attempts, status, event_name").eq("id", id).single();
  const row = r.data as Row | null;
  if (!row || (row.status !== "pending" && row.status !== "failed")) return "skipped";
  const s = await getSettings(["klaviyo.enabled", "klaviyo.api_revision", "klaviyo.max_attempts"] as const);
  if (!s["klaviyo.enabled"]) {
    await db().from("outbound_events").update({ status: "skipped" }).eq("id", id);
    return "skipped";
  }
  const transport = klaviyoTransport();
  const attempts = row.attempts + 1;
  const body = structuredClone(row.payload) as { data?: { attributes?: Record<string, unknown> } };
  if (!body?.data?.attributes) {
    await db().from("outbound_events").update({ status: "failed", attempts, last_error: "bad_payload" }).eq("id", id);
    return "failed";
  }
  if (row.kind === "event") body.data.attributes.unique_id = row.id; // retries never double-count
  const out: SendOutcome = transport ? await transport.post(ENDPOINT[row.kind], body, s["klaviyo.api_revision"]) : { ok: false, status: 0, permanent: false, error: "not_configured" };
  if (out.ok) {
    await db().from("outbound_events").update({ status: "sent", sent_at: now.toISOString(), attempts, last_status_code: out.status, last_error: null }).eq("id", id);
    return "sent";
  }
  const giveUp = out.permanent || attempts >= s["klaviyo.max_attempts"];
  const next = new Date(now.getTime() + (out.retryAfterMs ?? backoffMs(attempts)));
  await db()
    .from("outbound_events")
    .update({ status: giveUp ? "failed" : "pending", attempts, next_attempt_at: next.toISOString(), last_status_code: out.status || null, last_error: out.error.slice(0, 300) })
    .eq("id", id);
  if (giveUp) {
    const { track } = await import("@/lib/track");
    await track("error_klaviyo_send_failed", { event: row.event_name, status_code: out.status }, { source: "vault", actor: "system" });
  }
  return giveUp ? "failed" : "retry";
}

/** Cron: send everything due. */
export async function flushOutbox(now = new Date(), limit = 100): Promise<Record<string, number>> {
  const due = await db().from("outbound_events").select("id").eq("status", "pending").lte("next_attempt_at", now.toISOString()).order("next_attempt_at").limit(limit);
  const counts: Record<string, number> = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  for (const r of (due.data ?? []) as { id: string }[]) {
    try {
      counts[await flushRow(r.id, now)]++;
    } catch (e) {
      console.error(`[klaviyo] flush failed: ${(e as Error).message}`);
      counts.failed++;
    }
  }
  return counts;
}

/** Settings › Data sources: sent and failed per event over the last 7 days. */
export async function outboxStats(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = await db().from("outbound_events").select("event_name, status").gte("created_at", since).limit(20000);
  const out: Record<string, Record<string, number>> = {};
  for (const row of (r.data ?? []) as { event_name: string | null; status: string }[]) {
    const k = row.event_name ?? "(none)";
    out[k] ??= { pending: 0, sent: 0, failed: 0, skipped: 0 };
    out[k][row.status] = (out[k][row.status] ?? 0) + 1;
  }
  return out;
}

export async function retryFailed(): Promise<number> {
  const r = await db().from("outbound_events").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() }).eq("status", "failed").select("id");
  return r.data?.length ?? 0;
}

export async function testKlaviyo() {
  const transport = klaviyoTransport();
  if (!transport) return { ok: false, mode: "not_configured" };
  if (transport.kind === "fixtures") return { ok: true, mode: "fixtures" };
  const s = await getSettings(["klaviyo.api_revision"] as const);
  const res = await fetch("https://a.klaviyo.com/api/metrics/?page[size]=1", { headers: { authorization: `Klaviyo-API-Key ${env.optional("KLAVIYO_PRIVATE_KEY")}`, revision: s["klaviyo.api_revision"], accept: "application/vnd.api+json" } }).catch(() => null);
  return { ok: Boolean(res?.ok), mode: "live", status: res?.status ?? 0, revision: s["klaviyo.api_revision"] };
}
