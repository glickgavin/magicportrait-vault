import { describe, expect, it } from "vitest";
import { t, tn, hasKey } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

describe("t()", () => {
  it("returns English copy", () => {
    expect(t("app.name")).toBe("My Magic Portraits");
  });
  it("fills variables", () => {
    expect(t("home.hiShort", { name: "Sam" })).toBe("Hi Sam");
  });
  it("returns the key when missing", () => {
    expect(t("nope.missing")).toBe("nope.missing");
    expect(hasKey("nope.missing")).toBe(false);
  });
  it("never says vault or gift card to customers", () => {
    const json = JSON.stringify(en);
    expect(json.toLowerCase()).not.toMatch(/\bvault\b/);
    expect(json.toLowerCase()).not.toMatch(/gift card/);
  });
  it("has a plural helper", () => {
    expect(typeof tn).toBe("function");
  });
});
