import "server-only";
import { lastChecks, SOURCE_NAMES } from "@/lib/sources/health";
import { env } from "@/lib/env";
import type { SourceStatus } from "@/components/admin/DataSourcesCard";

const LABELS: Record<string, [string, string]> = {
  shopify: ["Shopify", "r_orders app · orders, mug choice"],
  imagen: ["Imagen", "imagegen-prod · sessions, images, orders"],
  mirror: ["Events mirror", "shopify-dailyreport · email → session, mug print status"],
  lookup: ["Portrait lookup", "Full lookup for you, cold and warm (target < 1.5 s warm)"],
  klaviyo: ["Klaviyo", "Events and profile properties (outbox)"],
  agentmail: ["Email sender", "AgentMail · cards@magicportraitspartners.com"],
  posthog: ["PostHog", "Project 540098"],
};

export async function sourceStatuses(): Promise<SourceStatus[]> {
  const checks = new Map((await lastChecks()).map((c) => [c.source, c]));
  return SOURCE_NAMES.map((s) => {
    const c = checks.get(s);
    return { source: s, label: LABELS[s][0], sub: `${LABELS[s][1]}${env.dataSource === "fixtures" && ["shopify", "imagen", "mirror", "lookup"].includes(s) ? " · fixtures" : ""}`, ok: c ? c.ok : null, checkedAt: c?.checked_at ?? null, lastOkAt: c?.last_ok_at ?? null, ms: c?.ms ?? null, detail: c?.detail ?? null };
  });
}
