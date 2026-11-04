import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, must } from "@/lib/db/client";
import { loadThemeAsset, putObject } from "@/lib/storage";
import { drawCard } from "@/lib/render/render";
import { parseLayout, type Layout } from "@/lib/render/layout";
import type { VersionRow } from "@/lib/db/themes";

export async function sampleRender(v: Pick<VersionRow, "background_path" | "overlay_path" | "layout" | "message_ideas">, size?: { w: number; h: number }, footerText = "Made with Magic Portraits AI", sample: "square" | "3x4" = "square") {
  const file = sample === "3x4" ? "assets/sample-portrait-3x4.jpg" : "assets/sample-portrait.jpg";
  const [background, overlay, portrait] = await Promise.all([loadThemeAsset(v.background_path), loadThemeAsset(v.overlay_path), readFile(path.join(process.cwd(), file))]);
  const layout: Layout = parseLayout(v.layout);
  const message = (v.message_ideas.find((i) => !i.includes("{pet}")) ?? v.message_ideas[0] ?? "Wishing you the happiest day.").replaceAll("{pet}", "Biscuit");
  return drawCard({ layout, background, overlay, portrait, to: "Grandma Rose", from: "Sam", message, footerText, size });
}

/** Publish: render a thumbnail (300 × 420) from the real artwork, store it, set the version live. */
export async function publishVersion(id: string): Promise<VersionRow> {
  const v = must(await db().from("theme_versions").select("*").eq("id", id).single(), "version") as VersionRow;
  const t = must(await db().from("themes").select("slug").eq("id", v.theme_id).single(), "theme") as { slug: string };
  const canvas = await sampleRender(v, { w: 300, h: 420 });
  const key = `${t.slug}/${v.slug}/thumb-${Date.now()}.jpg`;
  await putObject("theme-assets", key, await canvas.encode("jpeg", 82), "image/jpeg");
  return must(await db().from("theme_versions").update({ thumbnail_path: key, status: "live", published_at: new Date().toISOString() }).eq("id", id).select("*").single(), "publish") as VersionRow;
}

/**
 * The theme library's per-theme switch. On: the theme goes live and every draft version is published
 * (thumbnail rendered, as in the template editor). Off: the theme goes to draft, so customers stop
 * seeing it; its versions keep their status, so switching back on is instant. Archived versions are left alone.
 */
export async function setThemeLive(themeId: string, live: boolean): Promise<{ slug: string; published: VersionRow[]; failed: string[] }> {
  const t = must(await db().from("themes").select("id, slug, status").eq("id", themeId).single(), "theme") as { id: string; slug: string; status: string };
  const published: VersionRow[] = [];
  const failed: string[] = [];
  if (live) {
    const drafts = (must(await db().from("theme_versions").select("id, slug").eq("theme_id", themeId).eq("status", "draft"), "versions") ?? []) as { id: string; slug: string }[];
    for (const d of drafts) {
      try {
        published.push(await publishVersion(d.id));
      } catch {
        failed.push(d.slug);
      }
    }
  }
  must(await db().from("themes").update({ status: live ? "live" : "draft" }).eq("id", themeId).select("id").single(), "theme status");
  return { slug: t.slug, published, failed };
}
