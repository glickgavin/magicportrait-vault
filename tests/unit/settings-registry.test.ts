import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REGISTRY, LAUNCH_SWITCHES, getDef, validateSetting, type SettingKey } from "@/lib/settings/registry";
import { buildSeedSql, buildTestSeedSql } from "@/lib/seed-sql";

describe("settings registry", () => {
  it("every default passes its own validation", () => {
    for (const key of Object.keys(REGISTRY) as SettingKey[]) {
      const r = getDef(key).schema.safeParse(getDef(key).default);
      expect(r.success, key).toBe(true);
    }
  });
  it("every launch switch defaults to off", () => {
    for (const k of LAUNCH_SWITCHES) expect(getDef(k).default, k).toBe(false);
  });
  it("covers the documented keys", () => {
    for (const k of ["cards.enabled", "cards.who_can_create", "cards.per_customer", "gift.unlock_rule", "gift.link_valid_days", "redeem.mug_lock_states", "klaviyo.api_revision", "links.start_portrait_url", "auth.code_valid_minutes", "vault.lookup_cache_minutes"]) {
      expect(k in REGISTRY, k).toBe(true);
    }
  });
  it("rejects bad values", () => {
    expect(validateSetting("cards.message_max_chars", "220").ok).toBe(false);
    expect(validateSetting("cards.message_max_chars", 5).ok).toBe(false);
    expect(validateSetting("cards.who_can_create", "everyone").ok).toBe(false);
    expect(validateSetting("cards.per_customer", "lots").ok).toBe(false);
    expect(validateSetting("cards.per_customer", "5").ok).toBe(true);
    expect(validateSetting("redeem.allowed_image_hosts", ["not a host"]).ok).toBe(false);
    expect(validateSetting("gift.qualifying_product_ids", ["8600824643780"]).ok).toBe(true);
    expect(validateSetting("links.main_site_url", "javascript:alert(1)").ok).toBe(false);
  });
  it("accepts added variables with a dotted key", () => {
    expect(validateSetting("brand.new_thing", { a: 1 }).ok).toBe(true);
    expect(validateSetting("Bad Key", 1).ok).toBe(false);
  });
});

describe("seed files", () => {
  it("seed.sql and seed.test.sql are generated from the registry (run pnpm db:seed:gen)", () => {
    expect(readFileSync("supabase/seed.sql", "utf8")).toBe(buildSeedSql());
    expect(readFileSync("supabase/seed.test.sql", "utf8")).toBe(buildTestSeedSql());
  });
  it("the live seed keeps every version draft and is idempotent", () => {
    const sql = buildSeedSql();
    expect(sql).not.toMatch(/'live', (true|false), \d+, 'builtin/);
    expect(sql).not.toContain("example.com");
    const inserts = sql.match(/insert into/g)?.length ?? 0;
    const guarded = sql.match(/on conflict \([^)]+\) do nothing/g)?.length ?? 0;
    expect(guarded).toBe(inserts);
  });
});
