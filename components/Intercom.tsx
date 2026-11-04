"use client";

import { useEffect } from "react";

type W = Window & { Intercom?: ((...a: unknown[]) => void) & { q?: unknown[] }; intercomSettings?: Record<string, unknown> };

/** Intercom with no default launcher; "Chat With Us" buttons open it (same as the live site). */
export function Intercom() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_INTERCOM_APP_ID;
    if (!appId) return;
    const w = window as W;
    if (w.Intercom) return;
    w.intercomSettings = { api_base: "https://api-iam.intercom.io", app_id: appId, hide_default_launcher: true };
    const q: unknown[] = [];
    const stub = ((...args: unknown[]) => q.push(args)) as NonNullable<W["Intercom"]>;
    stub.q = q;
    w.Intercom = stub;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://widget.intercom.io/widget/${appId}`;
    document.body.appendChild(s);
    s.onload = () => w.Intercom?.("boot", w.intercomSettings);
  }, []);
  return null;
}
