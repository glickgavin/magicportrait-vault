import { en } from "./en";

type Dict = { [k: string]: string | Dict };

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (cur === undefined || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** All copy goes through t(). English only for now; missing keys return the key so they're easy to spot. */
export function t(key: string, vars?: Record<string, string | number | null | undefined>): string {
  const raw = lookup(en as unknown as Dict, key);
  if (raw === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Plural helper: picks `${key}_one` or `${key}_other`. */
export function tn(key: string, count: number, vars?: Record<string, string | number>): string {
  return t(`${key}_${count === 1 ? "one" : "other"}`, { count, ...vars });
}

export function hasKey(key: string): boolean {
  return lookup(en as unknown as Dict, key) !== undefined;
}
