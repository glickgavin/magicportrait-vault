"use client";

import type { ReactNode } from "react";
import type { EventName } from "@/lib/events";
import { trackClient } from "@/lib/track-client";

/** A plain link that records an event when tapped (used for links to the main site). */
export function TrackedLink({ href, event, props, className, children, testId }: { href: string; event: EventName; props?: Record<string, unknown>; className?: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} className={className} data-testid={testId} onClick={() => trackClient(event, props)}>
      {children}
    </a>
  );
}
