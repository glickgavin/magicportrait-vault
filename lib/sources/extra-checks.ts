import "server-only";
import { registerSourceCheck } from "./health";
import { testKlaviyo, outboxStats } from "@/lib/klaviyo";
import { emailSender } from "@/lib/email";

registerSourceCheck("klaviyo", async () => {
  const r = await testKlaviyo();
  const stats = await outboxStats(7);
  const sent = Object.values(stats).reduce((n, s) => n + (s.sent ?? 0), 0);
  const failed = Object.values(stats).reduce((n, s) => n + (s.failed ?? 0), 0);
  return { ...r, sent_7d: sent, failed_7d: failed } as Record<string, string | number | boolean>;
});

registerSourceCheck("agentmail", async () => emailSender().check());

registerSourceCheck("posthog", async () => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return { ok: false, mode: "not_configured" } as Record<string, string | number | boolean>;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  const res = await fetch(`${host}/decide/?v=3`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: key, distinct_id: "vault-health-check" }) }).catch(() => null);
  return { ok: Boolean(res?.ok), status: res?.status ?? 0 } as Record<string, string | number | boolean>;
});

/** Dreamship (docs/dreamship.md › Part C): reads the account; the key is never shown. */
registerSourceCheck("dreamship", async () => {
  const { dreamshipConfigured, getDreamship } = await import("./dreamship");
  if (!dreamshipConfigured()) return { ok: false, mode: "not_configured", has_key: false } as Record<string, string | number | boolean>;
  const ds = await getDreamship();
  const a = await ds.account();
  const flag = (v: boolean | null) => (v == null ? "unknown" : v ? "on" : "off");
  return {
    ok: Boolean(a.businessName),
    mode: ds.kind,
    business: a.businessName,
    plan: a.plan ?? "unknown",
    auto_import_orders: flag(a.settings.autoImportOrders),
    auto_submit_import_orders: flag(a.settings.autoSubmitImportOrders),
    auto_submit_api_orders: flag(a.settings.autoSubmitApiOrders),
  } as Record<string, string | number | boolean>;
});
