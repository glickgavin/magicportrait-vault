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
