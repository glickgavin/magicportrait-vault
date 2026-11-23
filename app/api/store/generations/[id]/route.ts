import { z } from "zod";
import { json, notFoundJson } from "@/lib/auth/http";
import { updateGeneration } from "@/lib/db/store";
import { asker, ownsVisitor } from "@/lib/open-store/owner";
import { generationFor, generationView, refreshGeneration } from "@/lib/open-store/pictures";

export const dynamic = "force-dynamic";

/** How a picture is going; the page asks every 2 s. Someone else's picture is a 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gen = await generationFor(id);
  if (!gen || !(await ownsVisitor(await asker(), gen.visitor_id))) return notFoundJson();
  return json({ generation: await generationView(await refreshGeneration(gen)) });
}

/** "Pick your favourite": which of the results goes on the product. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = z.object({ chosen: z.number().int().min(0).max(20) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const gen = await generationFor(id);
  if (!gen || !(await ownsVisitor(await asker(), gen.visitor_id))) return notFoundJson();
  if (gen.status !== "done" || p.data.chosen >= gen.images.length) return json({ error: "invalid" }, 400);
  return json({ generation: await generationView(await updateGeneration(gen.id, { chosen_index: p.data.chosen })) });
}
