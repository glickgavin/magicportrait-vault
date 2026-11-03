import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("session replay masking", () => {
  const src = readFileSync("components/PostHogProvider.tsx", "utf8");
  it("masks every input and blocks .ph-no-capture (card previews and images)", () => {
    expect(src).toMatch(/maskAllInputs:\s*true/);
    expect(src).toMatch(/blockSelector:\s*"\.ph-no-capture"/);
    expect(src).toMatch(/maskTextSelector:\s*"\[data-ph-mask\]"/);
  });
  it("CardPreview is blocked from replay", () => {
    expect(readFileSync("components/CardPreview.tsx", "utf8")).toContain("ph-no-capture");
  });
  it("URLs are scrubbed before sending", () => expect(src).toContain("sanitizeEventProperties"));
});
