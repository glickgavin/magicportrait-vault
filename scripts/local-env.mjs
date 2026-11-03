// Builds the environment for local dev, unit tests and e2e from the running local Supabase stack.
// Nothing here is a real secret: the stack's keys are the CLI's well-known local defaults.
import { execFileSync } from "node:child_process";

export function localSupabaseEnv() {
  let raw = "";
  try {
    raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.API_URL) return null;
  return env;
}

export function appTestEnv(port = 3100) {
  const sb = localSupabaseEnv();
  return {
    APP_URL: `http://localhost:${port}`,
    DATA_SOURCE: "fixtures",
    EMAIL_PROVIDER: "fixtures",
    KLAVIYO_PROVIDER: "fixtures",
    GIFT_LINK_SECRET: "local-test-gift-link-secret-0123456789abcdef0123456789",
    CRON_SECRET: "local-test-cron-secret",
    SHOPIFY_WEBHOOK_SECRET: "local-test-shopify-secret",
    AGENTMAIL_WEBHOOK_SECRET: "whsec_" + Buffer.from("local-test-agentmail-secret-32bytes!").toString("base64"),
    NEXT_PUBLIC_SUPABASE_URL: sb?.API_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: sb?.PUBLISHABLE_KEY ?? sb?.ANON_KEY ?? "",
    SUPABASE_SERVICE_ROLE_KEY: sb?.SECRET_KEY ?? sb?.SERVICE_ROLE_KEY ?? "",
    SUPABASE_DB_URL: sb?.DB_URL ?? "",
    MAILPIT_URL: sb?.MAILPIT_URL ?? "",
    NEXT_TELEMETRY_DISABLED: "1",
    SETTINGS_CACHE_MS: "0",
    E2E_FIXTURE_RESET: "1",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Print as a .env file (for `node scripts/local-env.mjs > .env.local`; .env.local is git-ignored).
  for (const [k, v] of Object.entries(appTestEnv(Number(process.argv[2] || 3000)))) console.log(`${k}=${v}`);
}
