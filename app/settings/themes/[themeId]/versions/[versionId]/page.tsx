import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { parseLayout } from "@/lib/render/layout";
import { themeAssetUrl } from "@/lib/render/assets";
import { getSettings } from "@/lib/settings";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { TrackPageView } from "@/components/TrackPageView";
import type { VersionRow } from "@/lib/db/themes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template editor" };

export default async function EditVersionPage({ params }: { params: Promise<{ themeId: string; versionId: string }> }) {
  const { themeId, versionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(versionId)) notFound();
  const v = (await db().from("theme_versions").select("*").eq("id", versionId).eq("theme_id", themeId).maybeSingle()).data as VersionRow | null;
  if (!v) notFound();
  const t = (await db().from("themes").select("name, category_id").eq("id", themeId).single()).data as { name: string; category_id: string };
  const c = (await db().from("theme_categories").select("name").eq("id", t.category_id).single()).data as { name: string };
  const s = await getSettings(["cards.message_max_chars", "cards.footer_text"] as const);
  return (
    <>
      <TrackPageView event="settings_viewed" props={{ section: "template" }} />
      <TemplateEditor
        versionId={v.id}
        themeName={t.name}
        categoryName={c.name}
        defaultMaxChars={s["cards.message_max_chars"]}
        footerText={s["cards.footer_text"]}
        initial={{
          name: v.name,
          status: v.status,
          isNew: v.is_new,
          layout: parseLayout(v.layout),
          ideas: v.message_ideas,
          maxChars: v.message_max_chars,
          backgroundUrl: themeAssetUrl(v.background_path)!,
          overlayUrl: themeAssetUrl(v.overlay_path),
          backgroundPath: v.background_path,
          overlayPath: v.overlay_path,
        }}
      />
    </>
  );
}
