#!/usr/bin/env node
// Fails the build when code sends an event name that isn't in lib/events.ts (docs/analytics.md).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const registry = readFileSync(join(root, "lib/events.ts"), "utf8");
const block = registry.slice(registry.indexOf("export const EVENTS"), registry.indexOf("} as const"));
const known = new Set([...block.matchAll(/^\s+([a-z0-9_]+):/gm)].map((m) => m[1]));

const dirs = ["app", "components", "lib", "emails", "scripts"];
const files = [];
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e)) files.push(p);
  }
}
dirs.forEach((d) => walk(join(root, d)));

// track("x"), trackClient("x"), trackServerEvent("x"), useTrackPageView("x"), sendBusinessEvent("x"), capture("x")
const callRe = /\b(?:track|trackClient|trackBusiness|useTrackPageView|capture|TrackPageView[^>]*event=)\s*\(?\s*["'`]([a-z0-9_$]+)["'`]/g;
const propRe = /\bevent=\{?["'`]([a-z0-9_]+)["'`]\}?/g;
const errors = [];
for (const f of files) {
  if (f.endsWith("lib/events.ts")) continue;
  const src = readFileSync(f, "utf8");
  for (const re of [callRe, propRe]) {
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (name.startsWith("$")) continue; // PostHog built-ins like $pageview
      if (!known.has(name)) errors.push(`${relative(root, f)}: unknown event "${name}"`);
    }
  }
}
if (errors.length) {
  console.error("Unknown event names (add them to docs/analytics.md and lib/events.ts first):\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`check-events: ${known.size} known events, ${files.length} files OK`);
