import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { setThemeLive } from "@/lib/admin/themes";

let themeId = "";

describe("theme library Live switch", () => {
  beforeAll(async () => {
    const src = (await db().from("theme_versions").select("background_path, overlay_path, layout, message_ideas").eq("status", "live").limit(1).single()).data!;
    const cat = (await db().from("theme_categories").select("id").limit(1).single()).data!.id as string;
    const slug = `switch-test-${Date.now()}`;
    themeId = (await db().from("themes").insert({ slug, name: "Switch test", category_id: cat, status: "draft" }).select("id").single()).data!.id as string;
    await db().from("theme_versions").insert([
      { theme_id: themeId, slug: "a", name: "A", status: "draft", ...src },
      { theme_id: themeId, slug: "b", name: "B", status: "draft", ...src },
      { theme_id: themeId, slug: "old", name: "Old", status: "archived", ...src },
    ]);
  });
  afterAll(async () => {
    await db().from("themes").delete().eq("id", themeId);
  });

  const state = async () => {
    const t = (await db().from("themes").select("status").eq("id", themeId).single()).data!.status as string;
    const vs = (await db().from("theme_versions").select("slug, status, thumbnail_path, published_at").eq("theme_id", themeId).order("slug")).data!;
    return { t, vs };
  };

  it("on: theme live, every draft published with a thumbnail, archived left alone", async () => {
    const r = await setThemeLive(themeId, true);
    expect(r.failed).toEqual([]);
    expect(r.published.map((v) => v.slug).sort()).toEqual(["a", "b"]);
    const { t, vs } = await state();
    expect(t).toBe("live");
    expect(vs.map((v) => [v.slug, v.status])).toEqual([["a", "live"], ["b", "live"], ["old", "archived"]]);
    for (const v of vs.filter((x) => x.status === "live")) {
      expect(v.thumbnail_path).toMatch(/thumb-\d+\.jpg$/);
      expect(v.published_at).toBeTruthy();
    }
  }, 60_000);

  it("off: theme draft, versions keep their status; on again publishes nothing new", async () => {
    await setThemeLive(themeId, false);
    let s = await state();
    expect(s.t).toBe("draft");
    expect(s.vs.filter((v) => v.status === "live")).toHaveLength(2);
    const r = await setThemeLive(themeId, true);
    expect(r.published).toHaveLength(0);
    s = await state();
    expect(s.t).toBe("live");
  });
});
