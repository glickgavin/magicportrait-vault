// Creates the PostHog dashboard, funnels and trends from docs/analytics.md §5 in project 540098.
// Runs only when POSTHOG_PERSONAL_API_KEY is set (it isn't in the build session). Safe to re-run: it
// reuses the dashboard by name and skips insights that already exist on it.
//   POSTHOG_PERSONAL_API_KEY=… node --experimental-strip-types scripts/posthog-setup.ts [--dry-run]
const key = process.env.POSTHOG_PERSONAL_API_KEY;
const project = process.env.POSTHOG_PROJECT_ID || "540098";
const host = process.env.POSTHOG_API_HOST || "https://us.posthog.com";
const dry = process.argv.includes("--dry-run");

type Step = string | string[];
const funnel = (name: string, steps: Step[], breakdown?: string) => ({
  name,
  query: {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: steps.map((s) => (Array.isArray(s) ? { kind: "EventsNode", event: s[0], name: s.join(" or ") } : { kind: "EventsNode", event: s, name: s })),
      funnelsFilter: { funnelWindowInterval: 14, funnelWindowIntervalUnit: "day" },
      ...(breakdown ? { breakdownFilter: { breakdown, breakdown_type: "event" } } : {}),
      dateRange: { date_from: "-30d" },
    },
  },
});
const trend = (name: string, events: string[], breakdown?: string) => ({
  name,
  query: {
    kind: "InsightVizNode",
    source: { kind: "TrendsQuery", series: events.map((e) => ({ kind: "EventsNode", event: e, name: e })), ...(breakdown ? { breakdownFilter: { breakdown, breakdown_type: "event" } } : {}), dateRange: { date_from: "-30d" }, interval: "day" },
  },
});

const INSIGHTS = [
  funnel("MMP · Card funnel", ["gift_offer_email_sent", "page_view_card_theme", "card_theme_selected", "card_portrait_selected", "card_create_tapped", "card_render_completed", ["card_email_sent", "card_shared", "card_downloaded"]], "entry_point"),
  funnel("MMP · First card funnel", ["page_view_card_first", "card_create_tapped", "card_render_completed"]),
  funnel("MMP · Sign-in health", ["page_view_vault_signin", "vault_code_requested", "vault_code_verified", "vault_lookup_succeeded"]),
  funnel("MMP · Vault to order", ["vault_signed_in", "vault_order_wall_art_tapped", "checkout_started", "purchase_completed"], "is_customer"),
  trend("MMP · Theme performance", ["card_theme_selected", "card_created"], "theme_slug"),
  funnel("MMP · Referral loop", ["page_view_card_received", "card_recipient_cta_tapped", "page_view_start", "funnel_generation_started", "purchase_completed"]),
  trend("MMP · Repeat use", ["card_create_tapped"]),
  trend("MMP · Quality: errors", ["error_card_render_failed", "error_klaviyo_send_failed", "$exception"]),
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${host}/api/projects/${project}${path}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function main() {
  if (!key) {
    console.log("POSTHOG_PERSONAL_API_KEY is not set; nothing to do.");
    return;
  }
  if (dry) {
    console.log(INSIGHTS.map((i) => i.name).join("\n"));
    return;
  }
  const list = await api<{ results: { id: number; name: string }[] }>("/dashboards/?limit=200");
  let dash = list.results.find((d) => d.name === "My Magic Portraits");
  if (!dash) dash = await api<{ id: number; name: string }>("/dashboards/", { method: "POST", body: JSON.stringify({ name: "My Magic Portraits", description: "Cards, sign-in and referrals (docs/analytics.md §5)" }) });
  const existing = await api<{ results: { name: string }[] }>(`/insights/?dashboards=${dash.id}&limit=200`);
  for (const i of INSIGHTS) {
    if (existing.results.some((e) => e.name === i.name)) continue;
    await api("/insights/", { method: "POST", body: JSON.stringify({ ...i, dashboards: [dash.id] }) });
    console.log(`created ${i.name}`);
  }
  console.log(`dashboard ${host}/project/${project}/dashboard/${dash.id}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

export {};
