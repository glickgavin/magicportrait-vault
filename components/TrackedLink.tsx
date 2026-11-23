"use client";

import type { ReactNode } from "react";
import type { EventName } from "@/lib/events";
import { trackClient } from "@/lib/track-client";

/** A plain link that records an event when tapped (used for links to the main site). */
export function TrackedLink({ href, event, props, className, children, testId, current }: { href: string; event: EventName; props?: Record<string, unknown>; className?: string; children: ReactNode; testId?: string; current?: boolean }) {
  return (
    <a href={href} className={className} data-testid={testId} aria-current={current ? "page" : undefined} onClick={() => trackClient(event, props)}>
      {children}
    </a>
  );
}
