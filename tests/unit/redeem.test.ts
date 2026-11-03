import { beforeEach, describe, expect, it } from "vitest";
import { fixtureSources } from "@/lib/sources";
import { saveMugChoice, loadOwnedOrderView } from "@/lib/redeem/service";
import { downloadAll, downloadOne } from "@/lib/redeem/downloads";
import { extFromContentType, fileName, mugChoiceValue, mugLockState, zipName } from "@/lib/redeem/lock";
import { setSetting } from "@/lib/settings";
import { fxImageId } from "@/lib/sources/fixtures-data";
import type { MugJob, ShopifyLineItem } from "@/lib/sources/types";

const S = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const samRoyal0 = fxImageId(S("5e550001", 1), 0);
const samRoyal2 = fxImageId(S("5e550001", 1), 2);

describe("mug lock rule (§6.6)", () => {
  const mugLine = (unfulfilled = 1): ShopifyLineItem => ({ id: "gid://shopify/LineItem/77", title: "Mug", quantity: 1, currentQuantity: 1, unfulfilledQuantity: unfulfilled, productId: null, productLegacyId: null, variantId: null, variantLegacyId: null, customAttributes: [], imageUrl: null });
  const job = (state: string, gelato: string | null = null): MugJob => ({ shopifyLineItemId: "77", tileId: null, state, gelatoOrderId: gelato, shopifyFulfillmentId: null, mugReady: false, manualApproval: null, trackingUrl: null, updatedAt: "" });
  const base = { mugLineItemId: "gid://shopify/LineItem/77", mode: "print_status" as const, lockStates: ["draft_created", "submitted", "passed", "printed", "shipped", "delivered"], lockDays: 14, now: new Date("2026-11-03T00:00:00Z") };
  const order = (o: Partial<{ cancelledAt: string | null; createdAt: string; unfulfilled: number }> = {}) => ({ cancelledAt: o.cancelledAt ?? null, createdAt: o.createdAt ?? "2026-11-01T00:00:00Z", lineItems: [mugLine(o.unfulfilled ?? 1)] });

  it("open while received, generating or file_ready", () => {
    for (const s of ["received", "generating", "file_ready"]) expect(mugLockState({ ...base, order: order(), jobs: [job(s)] }).locked, s).toBe(false);
  });
  it("locked from draft_created on", () => {
    for (const s of base.lockStates) expect(mugLockState({ ...base, order: order(), jobs: [job(s)] })).toMatchObject({ locked: true, reason: "printing" });
  });
  it("locked once a Gelato order exists, whatever the state", () => expect(mugLockState({ ...base, order: order(), jobs: [job("received", "g1")] }).locked).toBe(true));
  it("locked when the mug line is fulfilled", () => expect(mugLockState({ ...base, order: order({ unfulfilled: 0 }), jobs: [] })).toMatchObject({ locked: true, reason: "fulfilled" }));
  it("cancelled orders show as cancelled", () => expect(mugLockState({ ...base, order: order({ cancelledAt: "x" }), jobs: [] }).reason).toBe("cancelled"));
  it("a job for another line doesn't lock", () => expect(mugLockState({ ...base, order: order(), jobs: [{ ...job("printed"), shopifyLineItemId: "99" }] }).locked).toBe(false));
  it("days_after_order mode", () => {
    const m = { ...base, mode: "days_after_order" as const, jobs: [] };
    expect(mugLockState({ ...m, order: order({ createdAt: "2026-10-01T00:00:00Z" }) })).toMatchObject({ locked: true, reason: "days" });
    expect(mugLockState({ ...m, order: order({ createdAt: "2026-10-30T00:00:00Z" }) }).locked).toBe(false);
  });
});

describe("file names (§4.6)", () => {
  it("single files and the zip", () => {
    expect(fileName("magic-portrait-{theme}-{n}.{ext}", "Bathroom Bliss", "portrait", 2, extFromContentType("image/png"))).toBe("magic-portrait-bathroom-bliss-2.png");
    expect(fileName("magic-portrait-{theme}-{n}.{ext}", null, "portrait", 1, extFromContentType("application/octet-stream"))).toBe("magic-portrait-portrait-1.jpg");
    expect(zipName("magic-portraits-{orderName}.zip", "#1001")).toBe("magic-portraits-#1001.zip");
    expect(extFromContentType("image/webp")).toBe("webp");
    expect(extFromContentType("image/tiff")).toBe("tiff");
  });
  it("the metafield value keeps the live key order", () => {
    expect(mugChoiceValue("t1", "https://x/i.png", "redeem", new Date("2026-11-03T10:00:00Z"))).toBe('{"tile_id":"t1","image_url":"https://x/i.png","source":"redeem","updated_at":"2026-11-03T10:00:00.000Z"}');
  });
});

describe("mug save (§6.4) on fixtures", () => {
  const shop = () => fixtureSources().shopify;
  beforeEach(async () => {
    shop().reset();
    await setSetting("redeem.mug_offer_active", true, "test@example.com");
    await setSetting("redeem.downloads_enabled", true, "test@example.com");
  });

  it("saves: metafieldsSet with compareDigest and the exact value, then tagsAdd mug:ready", async () => {
    const r = await saveMugChoice("sam@example.com", "1001", samRoyal2);
    expect(r).toEqual({ ok: true, tileId: samRoyal2 });
    const [set, tag] = shop().writes;
    expect(set.type).toBe("metafieldsSet");
    const p = set.payload as { orderGid: string; namespace: string; key: string; type: string; value: string; compareDigest: string | null };
    expect(p).toMatchObject({ orderGid: "gid://shopify/Order/5550000001001", namespace: "custom", key: "mug_choice", type: "json", compareDigest: null });
    expect(Object.keys(JSON.parse(p.value))).toEqual(["tile_id", "image_url", "source", "updated_at"]);
    expect(JSON.parse(p.value)).toMatchObject({ tile_id: samRoyal2, source: "redeem" });
    expect(tag).toMatchObject({ type: "tagsAdd", payload: ["mug:ready"] });
    // A second save sends the new compareDigest
    await saveMugChoice("sam@example.com", "#1001", samRoyal0);
    expect((shop().writes[2].payload as { compareDigest: string | null }).compareDigest).toMatch(/^fx-/);
  });

  it("another email's order: 404, nothing written", async () => {
    expect(await saveMugChoice("rose@example.com", "1001", samRoyal0)).toMatchObject({ ok: false, status: 404 });
    expect(shop().writes).toHaveLength(0);
  });
  it("unknown order: the same 404", async () => expect(await saveMugChoice("sam@example.com", "424242", samRoyal0)).toMatchObject({ ok: false, status: 404, error: "not_found" }));
  it("no mug on the order: 409", async () => expect(await saveMugChoice("rose@example.com", "1003", fxImageId(S("5e550002", 1), 0))).toMatchObject({ status: 409, error: "no_mug" }));
  it("printing started: 409 locked", async () => expect(await saveMugChoice("sam@example.com", "1002", fxImageId(S("5e550001", 2), 1))).toMatchObject({ status: 409, error: "locked" }));
  it("a tile that isn't in the order: 422", async () => expect(await saveMugChoice("sam@example.com", "1001", fxImageId(S("5e550001", 1), 1))).toMatchObject({ status: 422, error: "invalid_tile" }));
  it("mug offer switched off: read-only (409)", async () => {
    await setSetting("redeem.mug_offer_active", false, "test@example.com");
    expect(await saveMugChoice("sam@example.com", "1001", samRoyal0)).toMatchObject({ status: 409, error: "closed" });
    expect(shop().writes).toHaveLength(0);
  });
  it("a Shopify error is a 502 with no detail", async () => {
    shop().failNextWrite = "ACCESS_DENIED";
    expect(await saveMugChoice("sam@example.com", "1001", samRoyal0)).toEqual({ ok: false, status: 502, error: "save_failed" });
  });
  it("Masterpiece _image_id tiles can be chosen (vault fix for live bug 8.4)", async () => {
    const view = await loadOwnedOrderView("rose@example.com", "1003");
    expect(view!.parsed.portraits.map((p) => p.tileType)).toContain("masterpiece");
  });
});

describe("downloads (§6.5) on fixtures", () => {
  beforeEach(async () => {
    fixtureSources().shopify.reset();
    await setSetting("redeem.downloads_enabled", true, "test@example.com");
  });
  const bodyKeys = async (r: Response) => Object.keys((await r.json()) as object);

  it("hi-res add-on order: single file with the live name", async () => {
    const r = await downloadOne("sam@example.com", "1001", 1);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="magic-portrait-royal-robes-1.jpg"');
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("Masterpiece order: enabled", async () => expect((await downloadOne("rose@example.com", "1003", 2)).status).toBe(200));
  it("prints only (no download product): 409, no file", async () => {
    const r = await downloadOne("sam@example.com", "1002", 1);
    expect(r.status).toBe(409);
    expect(await bodyKeys(r)).toEqual(["error"]);
  });
  it("kill switch: 409", async () => {
    await setSetting("redeem.downloads_enabled", false, "test@example.com");
    expect((await downloadOne("sam@example.com", "1001", 1)).status).toBe(409);
    expect((await downloadAll("sam@example.com", "1001")).status).toBe(409);
  });
  it("another email's order: 404 for single and zip, no detail", async () => {
    const a = await downloadOne("rose@example.com", "1001", 1);
    const b = await downloadAll("rose@example.com", "1001");
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await bodyKeys(a)).toEqual(["error"]);
  });
  it("position out of range: 404", async () => expect((await downloadOne("sam@example.com", "1001", 9)).status).toBe(404));
  it("zip streams every portrait with the same numbering", async () => {
    const r = await downloadAll("sam@example.com", "1001");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="magic-portraits-#1001.zip"');
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const text = buf.toString("latin1");
    expect(text).toContain("magic-portrait-royal-robes-1.jpg");
    expect(text).toContain("magic-portrait-royal-robes-2.jpg");
    expect(text).not.toContain("missing-files.txt");
  });
});
