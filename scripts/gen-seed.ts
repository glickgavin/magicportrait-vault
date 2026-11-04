// Generates supabase/seed.sql (live project) and supabase/seed.test.sql (local test stack only)
// from lib/settings/registry.ts and lib/seed-data.ts. Run: node --experimental-strip-types scripts/gen-seed.ts
import { writeFileSync } from "node:fs";
import { buildSeedSql, buildTestSeedSql } from "../lib/seed-sql.ts";

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), buildSeedSql());
writeFileSync(new URL("../supabase/seed.test.sql", import.meta.url), buildTestSeedSql());
console.log("wrote supabase/seed.sql and supabase/seed.test.sql");
