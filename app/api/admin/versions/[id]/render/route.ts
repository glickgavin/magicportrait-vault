import { adminOr404 } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { sampleRender } from "@/lib/admin/themes";
import { getSettings } from "@/lib/settings";
import type { VersionRow } from "@/lib/db/themes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Test render JPEG": the real renderer with a sample portrait and sample text. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const v = (await db().from("theme_versions").select("*").eq("id", (await ctx.params).id).single()).data as VersionRow | null;
  if (!v) return new Response("Not found", { status: 404 });
  const s = await getSettings(["cards.jpeg_quality", "cards.footer_text", "cards.size_px"] as const);
  const sample = new URL(req.url).searchParams.get("sample") === "3x4" ? "3x4" : "square";
  const canvas = await sampleRender(v, s["cards.size_px"], s["cards.footer_text"], sample);
  const jpeg = await canvas.encode("jpeg", s["cards.jpeg_quality"]);
  return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
}
