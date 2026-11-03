// Applies pending supabase/migrations/*.sql, then supabase/seed.sql, to the live project (magic-vault)
// through the Supabase Management API. Never applies seed.test.sql or any test data.
// Run: pnpm db:apply-remote   (needs SUPABASE_PROJECT_REF; the token is attached by the session's
// network secret, so no Authorization header is sent from here)
//   --dry-run   list what would run
//   --no-seed   skip seed.sql
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  console.error("SUPABASE_PROJECT_REF is not set");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const noSeed = process.argv.includes("--no-seed");
const root = new URL("..", import.meta.url).pathname;
const API = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function query<T = unknown>(sql: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  const res = await fetch(API, { method: "POST", headers, body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  await query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const applied = new Set((await query<{ version: string }[]>("select version from supabase_migrations.schema_migrations")).map((r) => r.version));

  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(f.split("_")[0]));
  console.log(`migrations: ${files.length} total, ${applied.size} applied, ${pending.length} pending`);

  for (const f of pending) {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    const name = rest.join("_");
    const sql = readFileSync(join(dir, f), "utf8");
    console.log(`${dryRun ? "[dry-run] would apply" : "applying"} ${f} (${createHash("sha256").update(sql).digest("hex").slice(0, 12)})`);
    if (dryRun) continue;
    // One request = one implicit transaction: the migration and its bookkeeping row land together.
    await query(`${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (${lit(version)}, ${lit(name)}, array[${lit(sql)}]);`);
  }

  if (!noSeed) {
    const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
    if (/seed\.test|seed-test|super@example\.com/.test(seed)) throw new Error("seed.sql looks like test data; refusing");
    console.log(`${dryRun ? "[dry-run] would apply" : "applying"} supabase/seed.sql`);
    if (!dryRun) await query(seed);
  }

  if (!dryRun) {
    const check = await query<{ key: string; value: unknown }[]>(
      `select key, value from public.settings where key in ('cards.enabled','gift.offer_email_enabled','gift.popup_enabled','gift.popup_email_later_enabled','gift.reminder_email_enabled','klaviyo.enabled') order by key`,
    );
    const on = check.filter((r) => r.value === true);
    console.log(`switches: ${check.map((r) => `${r.key}=${JSON.stringify(r.value)}`).join(", ")}`);
    if (on.length) console.warn(`WARNING: switched on in magic-vault: ${on.map((r) => r.key).join(", ")}`);
    const live = await query<{ n: number }[]>("select count(*)::int as n from public.theme_versions where status = 'live'");
    console.log(`live theme versions: ${live[0]?.n ?? 0}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
