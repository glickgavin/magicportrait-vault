import { describe, expect, it } from "vitest";
import { sanitizeUrl, sanitizeEventProperties } from "@/lib/posthog-sanitize";
import { initialsFor, maskEmail, firstName } from "@/lib/utils";

describe("PostHog URL sanitising", () => {
  it("drops the token on /g/ links", () => {
    expect(sanitizeUrl("https://my.magicportraits.ai/g/abcDEF123?x=1")).toBe("https://my.magicportraits.ai/g/[token]");
  });
  it("drops the query on /c/ pages", () => {
    expect(sanitizeUrl("https://my.magicportraits.ai/c/slug123?d=abc&utm_source=x")).toBe("https://my.magicportraits.ai/c/slug123");
  });
  it("drops email-like params elsewhere", () => {
    expect(sanitizeUrl("/signin?email=a@b.com&purpose=gift")).toBe("/signin?purpose=gift");
  });
  it("cleans every URL property", () => {
    const p = sanitizeEventProperties({ $current_url: "https://x.ai/g/tok", other: 1 });
    expect(p.$current_url).toBe("https://x.ai/g/[token]");
    expect(p.other).toBe(1);
  });
});

describe("initials and masking", () => {
  it("uses first and last name", () => expect(initialsFor("Sam Lee", "x@y.com")).toBe("SL"));
  it("falls back to the email", () => expect(initialsFor(null, "gavin@storyboards.io")).toBe("GA"));
  it("masks emails for logs", () => expect(maskEmail("sam@example.com")).toBe("s***@example.com"));
  it("gets the first name", () => expect(firstName("Sam Lee")).toBe("Sam"));
});
