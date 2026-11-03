"use client";

import posthog from "posthog-js";
import { EVENTS, isEventName, scrubProps, type EventName } from "@/lib/events";

function assertKnown(event: string): asserts event is EventName {
  if (!isEventName(event)) {
    const msg = `[track] unknown event "${event}" (not in docs/analytics.md)`;
    if (process.env.NODE_ENV !== "production") throw new Error(msg);
    console.warn(msg);
  }
}

function posthogReady(): boolean {
  return typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY) && posthog.__loaded;
}

/**
 * Browser-side tracking. UI events go to PostHog only.
 * Business events (allow-listed for the browser) go to POST /api/track, which takes the
 * email from the session and writes PostHog + activity_log on the server.
 */
export function trackClient(event: EventName, props?: Record<string, unknown>) {
  assertKnown(event);
  const clean = scrubProps(props);
  const def = EVENTS[event];
  if (def.business) {
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, props: clean }),
      keepalive: true,
    }).catch(() => undefined);
    return;
  }
  if (posthogReady()) posthog.capture(event, clean);
}

export function identifyClient(email: string, props?: Record<string, unknown>) {
  if (posthogReady()) posthog.identify(email.toLowerCase(), scrubProps(props));
}

export function resetClient() {
  if (posthogReady()) posthog.reset();
}

export function setSuperProps(props: Record<string, unknown>) {
  if (posthogReady()) posthog.register(scrubProps(props));
}
