import "server-only";
import { db, must } from "@/lib/db/client";
import { REGISTRY, getDef, isSettingKey, validateSetting, type SettingKey, type SettingValue, type Section, type SettingType } from "./registry";

const CACHE_MS = Number(process.env.SETTINGS_CACHE_MS ?? 15_000);
let cache: { at: number; values: Map<string, unknown> } | null = null;

export function clearSettingsCache() {
  cache = null;
}

async function loadAll(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const rows = must(await db().from("settings").select("key, value"), "load settings") as { key: string; value: unknown }[];
  const values = new Map<string, unknown>();
  for (const r of rows) values.set(r.key, r.value);
  cache = { at: Date.now(), values };
  return values;
}

/** A setting's value, validated against the registry; invalid or missing values fall back to the default. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await loadAll();
  return resolve(key, all);
}

export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const all = await loadAll();
  const out = {} as { [P in K]: SettingValue<P> };
  for (const k of keys) (out as Record<string, unknown>)[k] = resolve(k, all);
  return out;
}

function resolve<K extends SettingKey>(key: K, all: Map<string, unknown>): SettingValue<K> {
  const def = getDef(key);
  if (all.has(key)) {
    const r = def.schema.safeParse(all.get(key));
    if (r.success) return r.data as SettingValue<K>;
    console.warn(`[settings] invalid stored value for ${key}; using default`);
  }
  return def.default as SettingValue<K>;
}

/** Any stored value, including variables added in Settings that aren't in the registry. */
export async function getRawSetting(key: string): Promise<unknown> {
  const all = await loadAll();
  if (isSettingKey(key)) return resolve(key, all);
  return all.get(key);
}

export type SettingRow = {
  key: string;
  value: unknown;
  type: SettingType;
  section: Section;
  label: string;
  description: string | null;
  options: string[] | null;
  updated_by: string | null;
  updated_at: string | null;
  registered: boolean;
  readOnly: boolean;
};

export async function listSettings(): Promise<SettingRow[]> {
  const rows = must(await db().from("settings").select("key, value, type, section, label, description, options, updated_by, updated_at").order("key"), "list settings") as Omit<SettingRow, "registered" | "readOnly">[];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: SettingRow[] = [];
  for (const key of Object.keys(REGISTRY) as SettingKey[]) {
    const def = getDef(key);
    const row = byKey.get(key);
    out.push({
      key,
      value: row ? row.value : def.default,
      type: def.type,
      section: def.section,
      label: def.label,
      description: def.description ?? null,
      options: def.options ? [...def.options] : null,
      updated_by: row?.updated_by ?? null,
      updated_at: row?.updated_at ?? null,
      registered: true,
      readOnly: Boolean(def.readOnly),
    });
    byKey.delete(key);
  }
  for (const row of byKey.values()) out.push({ ...row, registered: false, readOnly: false });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export type SetResult = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * Validates and saves a setting. The `settings_history` trigger records the change;
 * the caller records `setting_changed` in activity_log (never the value).
 */
export async function setSetting(
  key: string,
  value: unknown,
  by: string,
  meta?: { type?: SettingType; section?: Section; label?: string; description?: string },
): Promise<SetResult> {
  const v = validateSetting(key, value);
  if (!v.ok) return v;
  if (isSettingKey(key) && getDef(key).readOnly) return { ok: false, error: "This setting is read-only" };
  const current = (await db().from("settings").select("value").eq("key", key).maybeSingle()).data as { value: unknown } | null;
  if (current && JSON.stringify(current.value) === JSON.stringify(v.value)) return { ok: true, changed: false };
  const def = isSettingKey(key) ? getDef(key) : null;
  const section = (def?.section ?? meta?.section ?? (key.split(".")[0] as Section)) as Section;
  const row = {
    key,
    value: v.value,
    type: def?.type ?? meta?.type ?? "json",
    section,
    label: def?.label ?? meta?.label ?? key,
    description: def?.description ?? meta?.description ?? null,
    options: def?.options ?? null,
    updated_by: by.toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  must(await db().from("settings").upsert(row, { onConflict: "key" }).select("key"), "save setting");
  clearSettingsCache();
  return { ok: true, changed: true };
}

export async function settingHistory(key?: string, limit = 50) {
  let q = db().from("settings_history").select("id, key, old_value, new_value, changed_by, changed_at").order("changed_at", { ascending: false }).limit(limit);
  if (key) q = q.eq("key", key);
  return must(await q, "settings history") as { id: number; key: string; old_value: unknown; new_value: unknown; changed_by: string | null; changed_at: string }[];
}
