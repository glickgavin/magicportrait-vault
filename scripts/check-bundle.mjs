// Searches the built browser bundle (.next/static) for anything that looks like a server secret.
// Run after `pnpm build`: node scripts/check-bundle.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../.next/static", import.meta.url).pathname;
const PATTERNS = [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["service_role JWT", /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/], // "service_role" in a JWT payload
  ["Shopify Admin token", /shpat_[a-f0-9]{20,}/],
  ["Shopify app secret", /shpss_[a-f0-9]{20,}/],
  ["Svix webhook secret", /whsec_[A-Za-z0-9+/=]{20,}/],
  ["Klaviyo private key", /pk_[a-f0-9]{30,}/],
  ["Postgres URL", /postgres(ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/],
  ["Env name: service role", /SUPABASE_SERVICE_ROLE_KEY/],
  ["Env name: gift link secret", /GIFT_LINK_SECRET/],
  ["Env name: cron secret", /CRON_SECRET/],
  ["Env name: AgentMail key", /AGENTMAIL_API_KEY/],
  ["Env name: Klaviyo key", /KLAVIYO_PRIVATE_KEY/],
  ["Env name: Shopify token", /SHOPIFY_ADMIN_ACCESS_TOKEN|SHOPIFY_WEBHOOK_SECRET/],
  ["Env name: database URLs", /IMAGEGEN_DATABASE_URL|MIRROR_DATABASE_URL/],
];
const extra = (process.env.SECRET_VALUES || "").split(",").filter((s) => s.length >= 12);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map)$/.test(e)) files.push(p);
  }
})(root);

const hits = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const [name, re] of PATTERNS) if (re.test(s)) hits.push(`${name} in ${f.replace(root, ".next/static")}`);
  for (const v of extra) if (s.includes(v)) hits.push(`a known secret value in ${f.replace(root, ".next/static")}`);
}
if (hits.length) {
  console.error("Possible secrets in the client bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`check-bundle: ${files.length} files, no secrets found`);
