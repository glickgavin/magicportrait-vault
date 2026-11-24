import { describe, expect, it } from "vitest";
import type { NumbersActivity, NumbersGeneration, NumbersVisitor } from "@/lib/db/store";
import { isEventName } from "@/lib/events";
import { decodeFirstTouch, encodeFirstTouch, firstTouchFrom, firstTouchSource } from "@/lib/open-store/first-touch";
import { splits, totals } from "@/lib/open-store/numbers";
import { sanitizeUrl } from "@/lib/posthog-sanitize";
import { track } from "@/lib/track";

describe("open store: first touch", () => {
  it("keeps the utm tags, the referrer's host (never its address) and the landing path", () => {
    const ft = firstTouchFrom(new URL("https://my.magicportraits.ai/store/product/1?utm_source=klaviyo&utm_campaign=Ready%20email&fbclid=abc&email=x@y.z"), "https://www.instagram.com/p/secret?igsh=1", new Date("2026-11-23T10:00:00Z"));
    expect(ft).toEqual({ utm_source: "klaviyo", utm_campaign: "Ready email", referrer_host: "www.instagram.com", landing_path: "/store/product/1", at: "2026-11-23T10:00:00.000Z" });
    expect(firstTouchSource(ft)).toBe("klaviyo");
    expect(firstTouchSource({ ...ft, utm_source: undefined })).toBe("www.instagram.com");
    expect(firstTouchSource(null)).toBe("direct");
  });
  it("our own host as referrer counts as none; the cookie round-trips and rejects anything else", () => {
    const ft = firstTouchFrom(new URL("https://my.magicportraits.ai/store"), "https://my.magicportraits.ai/store/c/wall-art");
    expect(ft.referrer_host).toBeNull();
    expect(decodeFirstTouch(encodeFirstTouch(ft))).toEqual(ft);
    expect(decodeFirstTouch("not json")).toBeNull();
    expect(decodeFirstTouch(encodeURIComponent(JSON.stringify({ landing_path: "https://evil", at: "x" })))).toBeNull();
    expect(decodeFirstTouch(encodeURIComponent(JSON.stringify({ landing_path: "/store", at: "2026-11-23T10:00:00Z", utm_source: "<script>", extra: "dropped" })))).toEqual({ landing_path: "/store", at: "2026-11-23T10:00:00Z", referrer_host: null, utm_source: "script" });
  });
});

describe("open store: addresses in PostHog", () => {
  it("store pages keep only utm_* and variant; /g tokens never leave", () => {
    expect(sanitizeUrl("https://my.magicportraits.ai/store/product/1?variant=2&g=6f1c2d3e-0000-4000-8000-123456789abc&from=email_link&utm_source=klaviyo")).toBe("https://my.magicportraits.ai/store/product/1?variant=2&utm_source=klaviyo");
    expect(sanitizeUrl("/store?sort=price-asc&type=Mugs")).toBe("/store");
    expect(sanitizeUrl("https://my.magicportraits.ai/g/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq")).toBe("https://my.magicportraits.ai/g/[token]");
  });
});

describe("open store: events", () => {
  it("the track() wrapper rejects an unknown store event in tests", async () => {
    expect(isEventName("store_generation_ready")).toBe(true);
    expect(isEventName("store_picture_downloaded")).toBe(false);
    await expect(track("store_picture_downloaded" as never, {})).rejects.toThrow(/unknown event/);
  });
});

describe("open store: Settings numbers", () => {
  const T = (min: number) => new Date(Date.UTC(2026, 10, 23, 12, min)).toISOString();
  const gen = (o: Partial<NumbersGeneration>): NumbersGeneration => ({ visitor_id: "v1", product_id: "gid://shopify/Product/8703000000", theme: "admiral-01", status: "done", created_at: T(0), finished_at: T(1), cost_usd: 0.08, order_id: null, email_to: null, email_consent: false, ...o });
  const visitors: NumbersVisitor[] = [
    { id: "v1", created_at: T(0), first_touch: { utm_source: "klaviyo", landing_path: "/store", at: T(0), referrer_host: null } },
    { id: "v2", created_at: T(0), first_touch: null },
  ];
  const generations = [
    gen({ order_id: "1", email_to: "a@example.com", email_consent: true }),
    gen({ finished_at: T(3), visitor_id: "v2", theme: "bathroom-01", product_id: "gid://shopify/Product/8702000000" }),
    gen({ status: "failed", finished_at: null, cost_usd: null, visitor_id: "v2" }),
    gen({ status: "timed_out", finished_at: null, cost_usd: null, created_at: T(-60 * 24 * 3) }),
  ];
  const activity: NumbersActivity[] = [
    { event: "store_added_to_cart", created_at: T(2), props: {} },
    { event: "store_order_paid", created_at: T(5), props: { revenue: "59.99" } },
    { event: "store_order_paid", created_at: T(6), props: { revenue: "10", test: true } },
  ];

  it("totals for a period: pictures, health, cost, emails, carts, paid orders (no test orders) and cost per order", () => {
    expect(totals({ generations, visitors, activity }, new Date(T(-1)))).toEqual({ visitors: 2, started: 3, ready: 2, failed: 1, medianSeconds: 120, costUsd: 0.16, emails: 1, ticked: 1, carts: 1, orders: 1, revenue: 59.99, costPerOrder: 0.16 });
    expect(totals({ generations, visitors, activity }, new Date(T(-60 * 24 * 7))).failed).toBe(2);
  });

  it("splits by product, theme and the first-touch channel", () => {
    const s = splits({ generations, visitors }, (id) => (visitors.find((v) => v.id === id)?.first_touch as never) ?? null);
    expect(s.product.map((r) => [r.key, r.started, r.ordered])).toEqual([
      ["8703000000", 3, 1],
      ["8702000000", 1, 0],
    ]);
    expect(s.theme[0]).toMatchObject({ key: "admiral-01", started: 3, ready: 1 });
    expect(s.channel.map((r) => [r.key, r.visitors, r.started])).toEqual([
      ["direct", 1, 2],
      ["klaviyo", 1, 2],
    ]);
  });
});
