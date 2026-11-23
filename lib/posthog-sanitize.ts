/**
 * PostHog drops the token and query string on /g/ and /c/ pages, keeps only utm_* and variant on /store pages
 * (docs/open-store.md › Privacy in analytics), and never keeps query strings that could carry an email (SPEC §14).
 */
export function sanitizeUrl(url: string | undefined | null): string | undefined | null {
  if (!url) return url;
  try {
    const u = new URL(url, "https://my.magicportraits.ai");
    const isAbs = /^https?:/.test(url);
    if (u.pathname.startsWith("/g/")) {
      u.pathname = "/g/[token]";
      u.search = "";
    } else if (u.pathname.startsWith("/c/")) {
      u.search = "";
    } else if (u.pathname === "/store" || u.pathname.startsWith("/store/")) {
      // The open store: only utm_* and variant survive (no picture ids, no `from`, no search text).
      for (const key of [...u.searchParams.keys()]) {
        if (!/^(utm_(source|medium|campaign|content|term)|variant)$/.test(key)) u.searchParams.delete(key);
      }
    } else {
      for (const key of [...u.searchParams.keys()]) {
        if (/email|token|code|^d$/i.test(key)) u.searchParams.delete(key);
      }
    }
    u.hash = "";
    return isAbs ? u.toString() : u.pathname + u.search;
  } catch {
    return url;
  }
}

const URL_PROPS = ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url"];

export function sanitizeEventProperties<T extends Record<string, unknown>>(props: T): T {
  const out: Record<string, unknown> = { ...props };
  for (const k of URL_PROPS) {
    if (typeof out[k] === "string") out[k] = sanitizeUrl(out[k] as string);
  }
  return out as T;
}
