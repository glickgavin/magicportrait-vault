"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export type PersonProps = { email: string; is_customer: boolean; first_order_at: string | null; portrait_count: number | null; session_count: number; cards_created: number; vault_first_seen_at: string | null };

/** identify(email) on every signed-in page, with the person properties from docs/analytics.md §2. */
export function Identify({ person }: { person: PersonProps }) {
  useEffect(() => {
    const run = () => {
      if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) return false;
      const { vault_first_seen_at, ...set } = person;
      posthog.identify(person.email, set, { vault_first_seen_at });
      posthog.register({ is_customer: person.is_customer });
      return true;
    };
    if (run()) return;
    const t = setInterval(() => run() && clearInterval(t), 500);
    const stop = setTimeout(() => clearInterval(t), 10_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [person]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_EVENTS === "1") (window as unknown as { __vaultIdentity?: PersonProps }).__vaultIdentity = person;
  }, [person]);
  return null;
}
