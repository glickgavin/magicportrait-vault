import { describe, expect, it } from "vitest";
import { daysUntilStart, isAvailable, isInSeason } from "@/lib/themes/season";
import { cardAccess } from "@/lib/cards/rules";

const xmas = { available_from: "2026-11-01", available_to: "2026-12-31", repeats_yearly: true };
const holidays = { available_from: "2026-11-15", available_to: "2026-01-05", repeats_yearly: true }; // wraps the year
const always = { available_from: null, available_to: null, repeats_yearly: true };
const once = { available_from: "2026-06-01", available_to: "2026-06-30", repeats_yearly: false };
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("theme windows", () => {
  it("repeating windows ignore the year", () => {
    expect(isAvailable(xmas, d("2026-11-03"))).toBe(true);
    expect(isAvailable(xmas, d("2030-12-24"))).toBe(true);
    expect(isAvailable(xmas, d("2026-10-31"))).toBe(false);
  });
  it("windows that wrap the new year", () => {
    expect(isAvailable(holidays, d("2026-12-31"))).toBe(true);
    expect(isAvailable(holidays, d("2027-01-05"))).toBe(true);
    expect(isAvailable(holidays, d("2027-01-06"))).toBe(false);
    expect(isAvailable(holidays, d("2026-11-14"))).toBe(false);
  });
  it("one-off windows", () => {
    expect(isAvailable(once, d("2026-06-15"))).toBe(true);
    expect(isAvailable(once, d("2027-06-15"))).toBe(false);
  });
  it("always available, never 'in season'", () => {
    expect(isAvailable(always, d("2026-03-03"))).toBe(true);
    expect(isInSeason(always, d("2026-03-03"), 45)).toBe(false);
  });
  it("in season inside the window or within N days before it", () => {
    expect(isInSeason(xmas, d("2026-10-01"), 45)).toBe(true);
    expect(isInSeason(xmas, d("2026-09-01"), 45)).toBe(false);
    expect(daysUntilStart(xmas, d("2026-10-30"))).toBe(2);
    expect(daysUntilStart(xmas, d("2026-11-30"))).toBe(0);
  });
});

describe("who can make cards", () => {
  const base = { enabled: true, whoCanCreate: "customers_with_order" as const, perCustomer: "unlimited", hasFreeGift: true, portraitCount: 5, cardsThisMonth: 0, now: d("2026-11-03") };
  it("allowed for a customer with the free gift", () => expect(cardAccess(base)).toEqual({ allowed: true }));
  it("paused when cards.enabled is off", () => expect(cardAccess({ ...base, enabled: false })).toMatchObject({ reason: "paused" }));
  it("locked for creators unless everyone_with_portrait", () => {
    expect(cardAccess({ ...base, hasFreeGift: false })).toMatchObject({ reason: "locked" });
    expect(cardAccess({ ...base, hasFreeGift: false, whoCanCreate: "everyone_with_portrait" })).toEqual({ allowed: true });
  });
  it("monthly limit says when the next one is available", () => {
    expect(cardAccess({ ...base, perCustomer: "2", cardsThisMonth: 1 })).toEqual({ allowed: true });
    expect(cardAccess({ ...base, perCustomer: "2", cardsThisMonth: 2 })).toEqual({ allowed: false, reason: "limit", nextAvailableAt: "2026-12-01T00:00:00.000Z" });
  });
  it("needs a portrait", () => expect(cardAccess({ ...base, portraitCount: 0 })).toMatchObject({ reason: "no_portraits" }));
});
