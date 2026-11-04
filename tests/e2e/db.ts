import { randomBytes } from "node:crypto";
import { admin } from "./auth";

export async function setSetting(key: string, value: unknown) {
  const { error } = await admin().from("settings").update({ value, updated_by: "e2e@example.com" }).eq("key", key);
  if (error) throw error;
}

export async function liveVersionId(fullSlug = "christmas-snowfall"): Promise<{ versionId: string; themeId: string }> {
  const [theme, ...rest] = fullSlug.split("-");
  const themeSlug = fullSlug.startsWith("new-year") ? "new-year" : fullSlug.startsWith("with-love") ? "with-love" : fullSlug.startsWith("thank-you") ? "thank-you" : theme;
  const versionSlug = fullSlug.slice(themeSlug.length + 1) || rest.join("-");
  const t = await admin().from("themes").select("id").eq("slug", themeSlug).single();
  const v = await admin().from("theme_versions").select("id").eq("theme_id", t.data!.id).eq("slug", versionSlug).single();
  return { versionId: v.data!.id, themeId: t.data!.id };
}

/** Inserts a card row directly (for screens that only need one to exist). */
export async function insertCard(sender: string, over: Record<string, unknown> = {}) {
  const { versionId, themeId } = await liveVersionId();
  const row = {
    public_id: "C-" + randomBytes(4).toString("hex").slice(0, 6),
    share_slug: randomBytes(16).toString("base64url"),
    sender_email: sender,
    from_name: "Rose",
    to_name: "Grandma",
    message: "Test message",
    theme_id: themeId,
    version_id: versionId,
    delivery: "self",
    status: "ready",
    ...over,
  };
  const { data, error } = await admin().from("cards").insert(row).select("*").single();
  if (error) throw error;
  return data as { id: string; public_id: string; share_slug: string };
}

export async function deleteCardsOf(sender: string) {
  await admin().from("cards").delete().eq("sender_email", sender);
}
