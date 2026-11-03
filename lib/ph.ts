"use client";

import type { PostHog } from "posthog-js";

/** posthog-js is loaded lazily (after the page is interactive) so it never weighs on first load. */
let instance: PostHog | null = null;
const waiting: ((p: PostHog) => void)[] = [];

export function ph(): PostHog | null {
  return instance && instance.__loaded ? instance : null;
}

export function whenPosthog(fn: (p: PostHog) => void) {
  const p = ph();
  if (p) fn(p);
  else waiting.push(fn);
}

export async function loadPosthog(init: (p: PostHog) => void) {
  if (instance) return;
  const mod = await import("posthog-js");
  instance = mod.default;
  init(instance);
  const flush = () => {
    if (!instance?.__loaded) return setTimeout(flush, 200);
    for (const fn of waiting.splice(0)) fn(instance);
  };
  flush();
}
