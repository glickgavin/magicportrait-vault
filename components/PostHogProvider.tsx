"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { sanitizeEventProperties } from "@/lib/posthog-sanitize";

let started = false;

export function PostHogProvider({ children, identity }: { children: React.ReactNode; identity?: { email: string; isCustomer?: boolean } | null }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || started) return;
    started = true;
    posthog.init(key, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      defaults: "2025-05-24",
      cross_subdomain_cookie: true,
      persistence: "localStorage+cookie",
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      capture_exceptions: true,
      person_profiles: "identified_only",
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask]",
        blockSelector: ".ph-no-capture",
      },
      before_send: (event) => {
        if (!event) return event;
        event.properties = sanitizeEventProperties(event.properties ?? {});
        return event;
      },
      loaded: (ph) => {
        ph.register({ app: "vault" });
      },
    });
  }, []);

  useEffect(() => {
    if (!identity?.email || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const t = setTimeout(() => {
      if (posthog.__loaded) {
        posthog.identify(identity.email.toLowerCase(), { email: identity.email.toLowerCase() });
        if (identity.isCustomer !== undefined) posthog.register({ is_customer: identity.isCustomer });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [identity?.email, identity?.isCustomer]);

  return <>{children}</>;
}
