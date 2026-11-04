import "server-only";
import { db } from "@/lib/db/client";
import { getSources } from "@/lib/sources";
import { track } from "@/lib/track";
import { getVaultProfile } from "@/lib/vault/profile";

export const SOURCE_NAMES = ["shopify", "imagen", "mirror", "lookup", "klaviyo", "agentmail", "posthog"] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export type CheckResult = { source: SourceName; ok: boolean; ms: number; detail: Record<string, string | number | boolean | string[]> };

type Extra = Partial<Record<SourceName, () => Promise<Record<string, string | number | boolean | string[]>>>>;
const extraChecks: Extra = {};
/** Later parts register checks for Klaviyo, AgentMail and PostHog here. */
export function registerSourceCheck(name: SourceName, fn: () => Promise<Record<string, string | number | boolean | string[]>>) {
  extraChecks[name] = fn;
}

const REQUIRED_SCOPES = ["read_orders", "read_all_orders", "write_orders", "read_customers"];

/** One harmless read per source. Records only counts and timings, never personal data. */
export async function testSource(name: SourceName, by: string): Promise<CheckResult> {
  const started = Date.now();
  let ok = false;
  let detail: CheckResult["detail"] = {};
  try {
    const { shopify, imagen, mirror } = await getSources();
    if (name === "shopify") {
      const r = await shopify.ping();
      const missing = REQUIRED_SCOPES.filter((s) => !r.scopes.includes(s));
      detail = { mode: shopify.kind, ...(r.auth ? { auth: r.auth } : {}), shop: r.shop, scopes: r.scopes.filter((s) => REQUIRED_SCOPES.includes(s)), missing_scopes: missing };
      ok = missing.length === 0;
    } else if (name === "imagen") {
      const r = await imagen.ping();
      detail = { mode: imagen.kind, rows: r.rows };
      ok = true;
    } else if (name === "mirror") {
      const r = await mirror.ping();
      detail = { mode: mirror.kind, rows: r.rows };
      ok = true;
    } else if (name === "lookup") {
      // Full portrait lookup for the person running the test: cold, then warm (target < 1.5 s warm).
      const t0 = Date.now();
      const cold = await getVaultProfile(by, { refresh: true });
      const coldMs = Date.now() - t0;
      const t1 = Date.now();
      const warm = await getVaultProfile(by, { refresh: false, createdVia: "sign_in" });
      const warmMs = Date.now() - t1;
      detail = { cold_ms: coldMs, warm_ms: warmMs, sessions: warm.sessions.length, portraits: cold.portraitCount, orders: cold.orders.length, under_target: warmMs < 1500 };
      // A lookup that ran with a source down is not a pass.
      if (cold.unavailable.length) detail.unavailable = cold.unavailable;
      ok = cold.unavailable.length === 0;
    } else {
      const fn = extraChecks[name];
      if (!fn) throw new Error("not_available");
      detail = await fn();
      ok = detail.ok !== false;
    }
  } catch (e) {
    const msg = (e as Error).message || "error";
    detail = { error: msg.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").slice(0, 200) };
    if (name === "shopify" && /^shopify_token_http_/.test(msg))
      detail.hint = "Shopify refused the client credentials: check SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET and that SHOPIFY_STORE_DOMAIN is the .myshopify.com domain the app is installed on.";
    else if (name === "shopify" && msg === "shopify_http_401")
      detail.hint = "Shopify rejected the token. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Dev Dashboard app) and redeploy.";
    // <ref>.supabase.co and db.<ref>.supabase.co aren't reachable from Vercel (API host / IPv6-only).
    if ((name === "imagen" || name === "mirror") && /CONNECT_TIMEOUT .*supabase\.co:5432/.test(msg))
      detail.hint = "Use the Supabase pooler connection string (…pooler.supabase.com, user vault_reader.<ref>), not the direct db host.";
    ok = false;
  }
  const ms = Date.now() - started;
  const now = new Date().toISOString();
  const prev = (await db().from("data_source_checks").select("last_ok_at").eq("source", name).maybeSingle()).data as { last_ok_at: string | null } | null;
  await db()
    .from("data_source_checks")
    .upsert({ source: name, ok, checked_at: now, last_ok_at: ok ? now : (prev?.last_ok_at ?? null), ms, detail, checked_by: by.toLowerCase() });
  await track("data_source_tested", { source: name, ok, ms }, { email: by, actor: `super_user:${by.toLowerCase()}`, ref: null });
  console.info(`[data-source] ${name} ok=${ok} ms=${ms}`);
  return { source: name, ok, ms, detail };
}

export async function lastChecks() {
  const r = await db().from("data_source_checks").select("source, ok, checked_at, last_ok_at, ms, detail");
  return (r.data ?? []) as { source: SourceName; ok: boolean; checked_at: string; last_ok_at: string | null; ms: number; detail: Record<string, unknown> }[];
}
