import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/client";
import { getSetting, setSetting, settingHistory, clearSettingsCache } from "@/lib/settings";
import { track } from "@/lib/track";

const KEY = "cards.message_max_chars";

describe("database (local stack)", () => {
  beforeAll(async () => {
    await setSetting(KEY, 220, "test@example.com");
    clearSettingsCache();
  });

  it("reads seeded settings with types", async () => {
    expect(await getSetting("cards.enabled")).toBe(true); // seed.test.sql turns it on locally
    expect(await getSetting("gift.popup_enabled")).toBe(false);
    expect(await getSetting(KEY)).toBe(220);
  });

  it("validates, saves and records history", async () => {
    const bad = await setSetting(KEY, "lots", "test@example.com");
    expect(bad.ok).toBe(false);
    const res = await setSetting(KEY, 240, "test@example.com");
    expect(res).toEqual({ ok: true, changed: true });
    expect(await getSetting(KEY)).toBe(240);
    const hist = await settingHistory(KEY, 1);
    expect(hist[0]).toMatchObject({ key: KEY, old_value: 220, new_value: 240, changed_by: "test@example.com" });
    await setSetting(KEY, 220, "test@example.com");
  });

  it("refuses read-only settings", async () => {
    const r = await setSetting("auth.code_valid_minutes", 5, "test@example.com");
    expect(r.ok).toBe(false);
  });

  it("activity_log is append-only", async () => {
    const { activityId } = await track("vault_code_requested", {}, { email: "append@example.com" });
    expect(activityId).toBeTypeOf("number");
    const upd = await db().from("activity_log").update({ event: "x" }).eq("id", activityId!);
    expect(upd.error?.message).toMatch(/append-only/);
    const del = await db().from("activity_log").delete().eq("id", activityId!);
    expect(del.error?.message).toMatch(/append-only/);
  });

  it("anonymise_activity is the one allowed mutation", async () => {
    await track("vault_code_requested", { email: "x" }, { email: "forget@example.com" });
    const { data } = await db().rpc("anonymise_activity", { p_email: "forget@example.com" });
    expect(data).toBeGreaterThan(0);
    const left = await db().from("activity_log").select("id").eq("email", "forget@example.com");
    expect(left.data).toEqual([]);
  });

  it("UI events don't reach activity_log", async () => {
    const r = await track("page_view_vault_home", {}, { email: "ui@example.com" });
    expect(r.activityId).toBeNull();
  });

  it("track rejects unknown names in test", async () => {
    // @ts-expect-error unknown event on purpose
    await expect(track("made_up_event", {})).rejects.toThrow(/unknown event/);
  });

  it("track never stores message text or recipient details", async () => {
    const { activityId } = await track("card_link_copied", { card_id: "C-abc123", message: "secret", to_name: "Rose", recipient_email: "r@example.com" }, { email: "priv@example.com" });
    const row = (await db().from("activity_log").select("props").eq("id", activityId!).single()).data as { props: Record<string, unknown> };
    expect(row.props).toEqual({ card_id: "C-abc123" });
  });

  it("writes the outbox row with the activity, once per dedupe key", async () => {
    const key = `test:${Date.now()}`;
    const a = await track("vault_signed_in", { method: "code" }, { email: "outbox@example.com", outbox: { kind: "event", dedupe_key: key, email: "outbox@example.com", event_name: "vault_signed_in", payload: { x: 1 } } });
    const b = await track("vault_signed_in", { method: "code" }, { email: "outbox@example.com", outbox: { kind: "event", dedupe_key: key, email: "outbox@example.com", event_name: "vault_signed_in", payload: { x: 1 } } });
    expect(a.outboxId).toBeTruthy();
    expect(b.outboxId).toBeNull();
  });

  it("hit_rate_limit allows up to max per window", async () => {
    const key = `test:${Math.random()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await db().rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 3 })).data as boolean);
    expect(results).toEqual([true, true, true, false]);
  });

  it("is_super_user reads super_users", async () => {
    expect((await db().rpc("is_super_user", { p_email: "SUPER@example.com " })).data).toBe(true);
    expect((await db().rpc("is_super_user", { p_email: "nobody@example.com" })).data).toBe(false);
  });

  it("RLS denies the browser key on every table and function", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const t of ["settings", "cards", "activity_log", "super_users", "vault_members", "gift_offers", "outbound_events", "theme_versions"]) {
      const r = await anon.from(t).select("*").limit(1);
      expect(r.data ?? [], t).toEqual([]);
    }
    const ins = await anon.from("activity_log").insert({ event: "x", source: "vault", actor: "system" });
    expect(ins.error).toBeTruthy();
    const rpc = await anon.rpc("is_super_user", { p_email: "super@example.com" });
    expect(rpc.error).toBeTruthy();
  });
});
