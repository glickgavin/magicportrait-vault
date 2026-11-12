import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIBRARY_ROOMS, LIBRARY_STUDIO, pictureLabel } from "@/lib/shop/photo-library";
import { templateSchema } from "@/lib/shop/template";

const pub = (src: string) => join(process.cwd(), "public", src);

describe("photo library", () => {
  it("has every file it lists", () => {
    const srcs = [
      ...LIBRARY_ROOMS.flatMap((r) => [r.background.src, ...(r.overlay ? [r.overlay.src] : []), ...r.photos.map((p) => p.src)]),
      ...LIBRARY_STUDIO.map((s) => s.src),
    ];
    expect(srcs.length).toBeGreaterThan(70);
    for (const s of srcs) {
      expect(s.startsWith("/shop-library/")).toBe(true);
      expect(existsSync(pub(s)), s).toBe(true);
    }
  });

  it("makes a valid template from each room", () => {
    for (const r of LIBRARY_ROOMS) {
      const t = {
        v: 1,
        background: { media_id: "upload:1/0123456789abcdef-1200x1200.jpg", url: "https://example.supabase.co/x.jpg", w: r.background.w, h: r.background.h },
        overlay: r.overlay ? { media_id: "upload:1/0123456789abcdef-1200x1200.webp", url: "https://example.supabase.co/x.webp", w: r.overlay.w, h: r.overlay.h } : null,
        zone: r.zone,
        mask: r.mask,
        blend: r.blend,
      };
      expect(templateSchema.safeParse(t).success, r.id).toBe(true);
      if (r.zone.kind === "corners") for (const [x, y] of r.zone.points) expect(x > 0 && x < 1 && y > 0 && y < 1).toBe(true);
      expect(r.overlay?.w).toBe(r.background.w);
    }
  });

  it("shows each room with the same 12 sample pictures", () => {
    for (const r of LIBRARY_ROOMS) expect(r.photos.map((p) => p.picture).sort()).toEqual([...LIBRARY_ROOMS[0].photos.map((p) => p.picture)].sort());
    expect(LIBRARY_ROOMS[0].photos).toHaveLength(12);
    expect(new Set(LIBRARY_ROOMS.map((r) => r.id)).size).toBe(LIBRARY_ROOMS.length);
  });

  it("labels pictures plainly", () => {
    expect(pictureLabel("beagle-peg-2")).toBe("Beagle peg 2");
  });
});
