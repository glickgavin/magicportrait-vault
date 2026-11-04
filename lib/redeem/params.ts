/** Order numbers from old /redeem links: "1001", "#1001" or a numeric id. Anything else is dropped. */
export function cleanOrderParam(v: string | string[] | null | undefined): string | null {
  const s = (Array.isArray(v) ? v[0] : v ?? "").trim().replace(/^%23/, "").replace(/^#/, "");
  return /^[A-Za-z0-9-]{1,30}$/.test(s) ? s : null;
}
