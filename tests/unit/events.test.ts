import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { EVENTS, isEventName, scrubProps, isBrowserBusinessEvent } from "@/lib/events";

describe("event registry", () => {
  it("knows the documented events", () => {
    expect(isEventName("card_created")).toBe(true);
    expect(isEventName("made_up_event")).toBe(false);
    expect(Object.keys(EVENTS).length).toBeGreaterThan(80);
  });
  it("only lets browser business events through /api/track", () => {
    expect(isBrowserBusinessEvent("card_shared")).toBe(true);
    expect(isBrowserBusinessEvent("card_created")).toBe(false);
    expect(isBrowserBusinessEvent("page_view_vault_home")).toBe(false);
  });
  it("scrubs message text and recipient details", () => {
    expect(scrubProps({ card_id: "C-1", message: "hi", to_name: "Rose", recipient_email: "r@x.com" })).toEqual({ card_id: "C-1" });
  });
  it("check-events script passes on the codebase", () => {
    const out = execFileSync("node", ["scripts/check-events.mjs"], { encoding: "utf8" });
    expect(out).toContain("OK");
  });
});
