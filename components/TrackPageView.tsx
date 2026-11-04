"use client";

import { useEffect } from "react";
import type { EventName } from "@/lib/events";
import { trackClient } from "@/lib/track-client";

/** Fires a page-view (or any UI) event once when a page mounts. */
export function TrackPageView({ event, props }: { event: EventName; props?: Record<string, unknown> }) {
  const key = JSON.stringify(props ?? {});
  useEffect(() => {
    trackClient(event, JSON.parse(key) as Record<string, unknown>);
  }, [event, key]);
  return null;
}
