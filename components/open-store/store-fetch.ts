"use client";

import { ph } from "@/lib/ph";

/**
 * The store's own API calls carry the browser's anonymous PostHog id (`x-ph-id`), kept on the visitor row so server
 * events and paid orders credit the same person (docs/open-store.md › Identity). Never an email: once identified,
 * the id isn't sent.
 */
export function storeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const id = ph()?.get_distinct_id?.();
  const headers = new Headers(init.headers);
  if (id && !id.includes("@")) headers.set("x-ph-id", id);
  return fetch(input, { ...init, headers });
}
