import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { listLayerArt, saveLayerArt, setLayerArtArchived } from "@/lib/shop/layer-art";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const MESSAGES: Record<string, string> = {
  not_an_image: "That file isn't a PNG or an SVG.",
  too_small: "That picture is too small: its long side must be at least 300 px.",
  unsafe_svg: "That SVG has scripts, links or embedded parts that can't be used. Export it as a plain drawing.",
  not_see_through: "A PNG must have a see-through background, or it would cover the customer's picture.",
};

/** The personalisation layer's art library (docs/shop.md › Personalisation layer). ?archived=1 lists archived ones too. */
export async function GET(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  return json({ art: await listLayerArt({ archived }) });
}

/** Adds a picture to the library (multipart: name, file; PNG with transparency, or SVG). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return json({ error: "That file is too big (5 MB at most)." }, 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const name = z.string().trim().min(1).max(60).safeParse(String(form?.get("name") ?? "") || (file && typeof file !== "string" ? file.name.replace(/\.[a-z0-9]+$/i, "") : ""));
  if (!file || typeof file === "string") return json({ error: "Choose a PNG or SVG to upload." }, 400);
  if (!name.success) return json({ error: "Give the picture a name (60 characters at most)." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "That file is too big (5 MB at most)." }, 413);
  const r = await saveLayerArt(u, name.data, Buffer.from(await file.arrayBuffer()), file.name);
  if (!r.ok) return json({ error: MESSAGES[r.reason] ?? "Couldn't use that file." }, 422);
  await track("admin_layer_art_changed", { action: "added", kind: r.item.kind }, { email: u.email, actor: `super_user:${u.email}` });
  return json({ ok: true, art: r.item });
}

/** Archives a picture (or brings it back). Products already offering it keep it until their template changes. */
export async function PATCH(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = z.object({ id: z.string().uuid(), archived: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  if (!(await setLayerArtArchived(p.data.id, p.data.archived))) return json({ error: "That picture isn't in the library." }, 404);
  await track("admin_layer_art_changed", { action: p.data.archived ? "archived" : "restored" }, { email: u.email, actor: `super_user:${u.email}` });
  return json({ ok: true });
}
