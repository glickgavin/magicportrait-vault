/**
 * A visitor's first touch (docs/open-store.md › First touch): the visit's `utm_*`, the referrer's host (never its
 * full address), the landing path and the time. proxy.ts keeps it in a short cookie on the first store page; the
 * visitor row takes it on their first real action. Pure, so the proxy and tests share it.
 */
export const FIRST_TOUCH_COOKIE = "mmp_ft";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type FirstTouch = Partial<Record<(typeof UTM)[number], string>> & { referrer_host: string | null; landing_path: string; at: string };

const clean = (v: string) =>
  v
    .replace(/[^\p{L}\p{N} ._:/@+-]/gu, "")
    .trim()
    .slice(0, 100);

/** From the landing request: its address and Referer header. Our own host as the referrer counts as none. */
export function firstTouchFrom(url: URL, referer: string | null, now = new Date()): FirstTouch {
  const ft: FirstTouch = { referrer_host: null, landing_path: url.pathname.slice(0, 200), at: now.toISOString() };
  for (const k of UTM) {
    const v = url.searchParams.get(k);
    if (v && clean(v)) ft[k] = clean(v);
  }
  if (referer) {
    try {
      const host = new URL(referer).host.toLowerCase();
      if (host && host !== url.host.toLowerCase()) ft.referrer_host = host.slice(0, 100);
    } catch {
      /* not a URL: none */
    }
  }
  return ft;
}

export function encodeFirstTouch(ft: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(ft));
}

/** The cookie back into a first touch, or null when it's missing or not ours. Only known keys survive. */
export function decodeFirstTouch(v: string | null | undefined): FirstTouch | null {
  if (!v) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(v)) as Record<string, unknown>;
    if (typeof raw.landing_path !== "string" || typeof raw.at !== "string" || !raw.landing_path.startsWith("/")) return null;
    const ft: FirstTouch = { referrer_host: typeof raw.referrer_host === "string" ? clean(raw.referrer_host) || null : null, landing_path: raw.landing_path.slice(0, 200), at: Number.isNaN(Date.parse(raw.at)) ? new Date().toISOString() : raw.at };
    for (const k of UTM) if (typeof raw[k] === "string" && clean(raw[k] as string)) ft[k] = clean(raw[k] as string);
    return ft;
  } catch {
    return null;
  }
}

/** The channel a first touch counts under: its utm_source, else the referrer's host, else "direct". */
export function firstTouchSource(ft: FirstTouch | null | undefined): string {
  return ft?.utm_source || ft?.referrer_host || "direct";
}

/** `utm_*` and `variant` stay on /store addresses in PostHog; everything else in the query string is dropped. */
export const STORE_KEEP_PARAMS = /^(utm_(source|medium|campaign|content|term)|variant)$/;
