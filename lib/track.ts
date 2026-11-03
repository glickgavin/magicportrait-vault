import "server-only";
import { PostHog } from "posthog-node";
import { EVENTS, isEventName, scrubProps, type EventName } from "@/lib/events";
import { db } from "@/lib/db/client";
import { maskEmail } from "@/lib/utils";

export type TrackSource = "vault" | "shopify" | "imagen" | "email";
export type TrackActor = "customer" | "recipient" | "system" | `super_user:${string}`;
export type RefType = "card" | "order" | "session" | "image" | "setting" | "theme" | "version" | "category" | "customer" | "request" | "delivery";

export type OutboxInput = {
  kind: "event" | "profile" | "deletion";
  dedupe_key?: string | null;
  email: string;
  event_name?: string | null;
  payload: Record<string, unknown>;
  status?: "pending" | "skipped";
};

export type TrackOptions = {
  email?: string | null;
  source?: TrackSource;
  ref?: { type: RefType; id: string } | null;
  actor?: TrackActor;
  /** PostHog distinct id when there's no email (e.g. card recipients: the card id). */
  distinctId?: string;
  /** Written in the same transaction as the activity row (Klaviyo outbox). Built automatically for Klaviyo events. */
  outbox?: OutboxInput | null;
  /** Klaviyo-only properties (e.g. the one-tap link) that must never reach PostHog or activity_log, and a dedupe key. */
  klaviyo?: { extra?: Record<string, unknown>; dedupeKey?: string | null };
};

export type TrackResult = { activityId: number | null; outboxId: string | null };

let ph: PostHog | null = null;
function posthog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || process.env.NODE_ENV === "test" || process.env.DATA_SOURCE === "fixtures" && process.env.POSTHOG_SERVER_IN_FIXTURES !== "1") return null;
  if (!ph) ph = new PostHog(key, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com", flushAt: 1, flushInterval: 0 });
  return ph;
}

/** In tests, every event sent to PostHog is recorded here so tests can inspect it. */
export const capturedForTests: { event: string; distinctId: string; properties: Record<string, unknown> }[] = [];

/**
 * The only way the server records an event (CLAUDE.md). Names must be in docs/analytics.md.
 * Business events go to PostHog and activity_log; UI events to PostHog only.
 * Never throws to the caller: tracking must not break the action it describes.
 */
export async function track(event: EventName, props: Record<string, unknown> = {}, opts: TrackOptions = {}): Promise<TrackResult> {
  if (!isEventName(event)) {
    const msg = `[track] unknown event "${event}"`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    console.warn(msg);
    return { activityId: null, outboxId: null };
  }
  const clean = scrubProps(props);
  const email = opts.email ? opts.email.trim().toLowerCase() : null;
  const distinctId = email ?? opts.distinctId ?? "anonymous";
  const properties = { ...clean, app: "vault", $process_person_profile: Boolean(email) };

  if (process.env.NODE_ENV === "test" || process.env.VAULT_CAPTURE_EVENTS === "1") capturedForTests.push({ event, distinctId, properties });

  const client = posthog();
  if (client) {
    try {
      await client.captureImmediate({ distinctId, event, properties });
    } catch (e) {
      console.warn(`[track] posthog failed for ${event}: ${(e as Error).message}`);
    }
  }

  let result: TrackResult = { activityId: null, outboxId: null };
  if (EVENTS[event].business) {
    try {
      let outbox = opts.outbox ?? null;
      if (!outbox && email && (EVENTS[event] as { klaviyo?: boolean }).klaviyo) {
        const { klaviyoEventOutbox } = await import("@/lib/klaviyo");
        outbox = await klaviyoEventOutbox(event, clean, email, opts.klaviyo?.extra, opts.klaviyo?.dedupeKey);
      }
      const { data, error } = await db().rpc("record_activity", {
        p_email: email,
        p_event: event,
        p_source: opts.source ?? "vault",
        p_ref_type: opts.ref?.type ?? null,
        p_ref_id: opts.ref?.id ?? null,
        p_props: clean,
        p_actor: opts.actor ?? (email ? "customer" : "system"),
        p_outbox: outbox,
      });
      if (error) throw new Error(error.message);
      const d = data as { activity_id: number; outbox_id: string | null };
      result = { activityId: d.activity_id, outboxId: d.outbox_id };
      if (d.outbox_id && outbox?.status !== "skipped") {
        const { flushRow } = await import("@/lib/klaviyo");
        await flushRow(d.outbox_id).catch(() => undefined); // send at once; cron retries
      }
    } catch (e) {
      console.error(`[track] activity_log write failed for ${event} (${maskEmail(email)}): ${(e as Error).message}`);
    }
  }
  return result;
}
