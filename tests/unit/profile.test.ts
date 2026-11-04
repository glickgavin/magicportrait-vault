import { describe, expect, it, vi } from "vitest";
import { getVaultProfile } from "@/lib/vault/profile";
import { pickFirstCardPortrait } from "@/lib/vault/profile-core";
import { fxImageId } from "@/lib/sources/fixtures-data";

const S = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("getVaultProfile on fixtures", () => {
  it("a customer: orders, sessions incl. recommendation children, name and initials", async () => {
    const p = await getVaultProfile("Sam@Example.com ", { refresh: true });
    expect(p.state).toBe("customer");
    expect(p.isCustomer).toBe(true);
    expect(p.hasFreeGift).toBe(true);
    expect(p.displayName).toBe("Sam Lee");
    expect(p.initials).toBe("SL");
    expect(p.orders.map((o) => o.name)).toEqual(["#1002", "#1001"]);
    expect(p.sessions).toHaveLength(3);
    const child = p.sessions.find((s) => s.isRecommendationChild)!;
    expect(child.parentSessionId).toBe(S("5e550001", 1));
    expect(child.orderUrl).toContain(`session=${S("1a000000", 1)}`); // inherits the parent's deep link
    expect(p.portraitCount).toBe(12);
    // ordered via revenue_events, and via an order line without a revenue event
    const royal = p.sessions.find((s) => s.sessionId === S("5e550001", 1))!;
    expect(royal.portraits.filter((x) => x.ordered).map((x) => x.tileIndex)).toEqual([0, 2]);
    const cozy = p.sessions.find((s) => s.sessionId === S("5e550001", 2))!;
    expect(cozy.portraits.find((x) => x.tileIndex === 1)!.orderNames).toEqual(["#1002"]);
    expect(p.memberId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("an image ordered in one session but not another; other-email and cancelled orders", async () => {
    const p = await getVaultProfile("rose@example.com", { refresh: true });
    const garden = p.sessions.find((s) => s.sessionId === S("5e550002", 1))!;
    const bath = p.sessions.find((s) => s.sessionId === S("5e550002", 2))!;
    expect(garden.ordered).toBe(true);
    expect(bath.ordered).toBe(false); // its only order (#1004) was cancelled and refunded
    expect(garden.portraits.find((x) => x.imageId === fxImageId(S("5e550002", 1), 1))!.ordered).toBe(true); // placed on another email
    expect(garden.portraits.find((x) => x.imageId === fxImageId(S("5e550002", 1), 2))!.ordered).toBe(true); // Masterpiece _image_id
    expect(garden.portraits.find((x) => x.imageId === fxImageId(S("5e550002", 1), 3))!.ordered).toBe(false);
  });

  it("a creator with no order", async () => {
    const p = await getVaultProfile("charlie@example.com", { refresh: true });
    expect(p.state).toBe("creator");
    expect(p.isCustomer).toBe(false);
    expect(p.hasFreeGift).toBe(false);
    expect(p.portraitCount).toBe(8);
    expect(p.initials).toBe("CH");
    expect(p.sessions.find((s) => !s.petName)).toBeTruthy();
  });

  it("only a cancelled order: a creator, no free gift", async () => {
    const p = await getVaultProfile("cancel@example.com", { refresh: true });
    expect(p.state).toBe("creator");
    expect(p.hasFreeGift).toBe(false);
    expect(p.orderedCount).toBe(0);
  });

  it("nobody", async () => {
    const p = await getVaultProfile("nobody@example.com", { refresh: true });
    expect(p.state).toBe("nobody");
    expect(p.sessions).toEqual([]);
    expect(p.orders).toEqual([]);
  });

  it("uses the cached session list inside the cache window", async () => {
    await getVaultProfile("sam@example.com", { refresh: true });
    const warm = await getVaultProfile("sam@example.com", { refresh: false });
    expect(warm.sessions).toHaveLength(3);
  });

  it("first card portrait: newest ordered, else newest", async () => {
    const sam = await getVaultProfile("sam@example.com", { refresh: true });
    expect(pickFirstCardPortrait(sam)!.portrait.ordered).toBe(true);
    const charlie = await getVaultProfile("charlie@example.com", { refresh: true });
    const pick = pickFirstCardPortrait(charlie)!;
    expect(pick.portrait.createdAt).toBe(charlie.sessions.flatMap((s) => s.portraits).map((x) => x.createdAt).sort().reverse()[0]);
  });
});

describe("getVaultProfile with a failing source", () => {
  it("returns a partial profile instead of throwing, and doesn't touch the member cache", async () => {
    const sources = await import("@/lib/sources");
    const real = await sources.getSources();
    const spy = vi.spyOn(sources, "getSources").mockResolvedValue({
      ...real,
      shopify: { ...real.shopify, ordersByEmail: async () => { throw new Error("shopify_http_401"); } },
    } as Awaited<ReturnType<typeof sources.getSources>>);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const p = await getVaultProfile("partial-" + Date.now() + "@example.com", { refresh: true });
      expect(p.unavailable).toEqual(["shopify"]);
      expect(p.orders).toEqual([]);
      expect(p.memberId).toBeNull();
      expect(err.mock.calls.flat().join(" ")).not.toMatch(/partial-\d+@example\.com/);
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
  });

  it("is empty when every source works", async () => {
    const p = await getVaultProfile("sam@example.com", { refresh: true });
    expect(p.unavailable).toEqual([]);
  });
});
