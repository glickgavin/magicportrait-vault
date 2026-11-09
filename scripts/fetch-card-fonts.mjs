#!/usr/bin/env node
// Fetches the card fonts (Google Fonts via Fontsource, SIL OFL) into public/fonts/card/, latin subset,
// one .woff2 per weight, plus each font's licence. Run after changing FONT_DEFS in lib/render/fonts.ts:
//   node scripts/fetch-card-fonts.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = readFileSync(path.join(root, "lib/render/fonts.ts"), "utf8");
const defs = [...src.matchAll(/weights: \[([\d, ]+)\][^}]*slug: "([a-z-]+)"/g)].map((m) => ({ slug: m[2], weights: m[1].split(",").map((s) => s.trim()) }));
const out = path.join(root, "public/fonts/card");
mkdirSync(out, { recursive: true });
for (const d of defs) {
  const work = mkdtempSync(path.join(tmpdir(), "card-font-"));
  execFileSync("npm", ["pack", `@fontsource/${d.slug}@5`, "--silent"], { cwd: work });
  const tgz = execFileSync("sh", ["-c", "ls *.tgz"], { cwd: work }).toString().trim();
  execFileSync("tar", ["xzf", tgz], { cwd: work });
  for (const w of d.weights) {
    const f = `${d.slug}-latin-${w}-normal.woff2`;
    copyFileSync(path.join(work, "package/files", f), path.join(out, f));
  }
  const lic = path.join(work, "package/LICENSE");
  if (existsSync(lic)) copyFileSync(lic, path.join(out, `OFL-${d.slug}.txt`));
  rmSync(work, { recursive: true, force: true });
  console.log(`${d.slug}: ${d.weights.join(", ")}`);
}
