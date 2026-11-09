import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db/client";
import { putObject } from "@/lib/storage";
import { sampleRender } from "@/lib/admin/themes";
import type { VersionRow } from "@/lib/db/themes";

describe("a design's own placeholder image", () => {
  it("is used by the sample render when chosen, and the built-in sample otherwise (or when its file is gone)", async () => {
    const v = (await db().from("theme_versions").select("*").eq("status", "live").limit(1).single()).data as VersionRow;
    const blue = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 25, g: 144, b: 198 } } }).jpeg().toBuffer();
    const key = `test/placeholder-${Date.now()}.jpg`;
    await putObject("theme-assets", key, blue, "image/jpeg");
    const layout = v.layout as { photo: { x: number; y: number; w: number; h: number } };
    const centre = async (c: Awaited<ReturnType<typeof sampleRender>>) => [...c.getContext("2d").getImageData(Math.round(layout.photo.x + layout.photo.w / 2), Math.round(layout.photo.y + layout.photo.h / 2), 1, 1).data].slice(0, 3);
    const size = { w: 1500, h: 2100 };
    const custom = await centre(await sampleRender({ ...v, sample_portrait_path: key }, size, "", "custom"));
    expect(custom.every((c, i) => Math.abs(c - [25, 144, 198][i]) <= 6)).toBe(true);
    const builtin = await centre(await sampleRender({ ...v, sample_portrait_path: key }, size, "", "square"));
    expect(builtin).not.toEqual(custom);
    const missing = await centre(await sampleRender({ ...v, sample_portrait_path: "test/does-not-exist.jpg" }, size, "", "custom"));
    expect(missing).toEqual(builtin);
  });
});
