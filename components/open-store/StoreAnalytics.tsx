"use client";

import { useEffect } from "react";
import { whenPosthog } from "@/lib/ph";

const KEYS = ["area", "signed_in", "returning", "preview"] as const;

/**
 * Super properties on every store event (docs/open-store.md › Identity): `area`, `signed_in`, `returning` and
 * `preview` (plus `app` and the visit's utm_*, which PostHogProvider registers). Registered on store pages only and
 * removed on the way out, so the signed-in screens' events never carry them.
 */
export function StoreAnalytics({ signedIn, preview }: { signedIn: boolean; preview: boolean }) {
  useEffect(() => {
    let returning = false;
    try {
      // Per-browser convenience only: an earlier visit on another day.
      const first = window.localStorage.getItem("mmp_store_first_visit");
      const today = new Date().toISOString().slice(0, 10);
      if (!first) window.localStorage.setItem("mmp_store_first_visit", today);
      returning = Boolean(first && first !== today);
    } catch {
      /* private window: not returning */
    }
    whenPosthog((ph) => ph.register({ area: "open_store", signed_in: signedIn, returning, preview }));
    return () => whenPosthog((ph) => KEYS.forEach((k) => ph.unregister(k)));
  }, [signedIn, preview]);
  return null;
}
