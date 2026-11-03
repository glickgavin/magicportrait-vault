"use client";

import { useEffect } from "react";
import { setSuperProps } from "@/lib/track-client";

/** Registers PostHog super properties (e.g. entry_point) for the rest of the visit. */
export function SuperProps({ props }: { props: Record<string, unknown> }) {
  const key = JSON.stringify(props);
  useEffect(() => {
    setSuperProps(JSON.parse(key) as Record<string, unknown>);
  }, [key]);
  return null;
}
