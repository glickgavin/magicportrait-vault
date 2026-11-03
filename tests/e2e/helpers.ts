import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectNoAxeViolations(page: Page, opts: { exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const results = await builder.analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}
