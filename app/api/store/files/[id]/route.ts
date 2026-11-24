import { notFoundJson } from "@/lib/auth/http";
import { generationById, storePhotoById } from "@/lib/db/store";
import { asker, canSeeVisitorFile } from "@/lib/open-store/owner";
import { parsePreviewId, previewPath } from "@/lib/open-store/cart";
import { parseFileId } from "@/lib/open-store/pictures";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A visitor's photo or picture (docs/open-store.md › Tables and bucket): only for the browser whose cookie is that
 * visitor, a signed-in email linked to it, or a super user. Anything else, including a missing file, is a 404.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pv = parsePreviewId(id);
  if (pv) {
    // A cart line's preview: the visitor is part of the id, so it's checked like any of their files.
    if (!(await canSeeVisitorFile(await asker(), pv.visitorId))) return notFoundJson();
    const body = await getObject("store-uploads", previewPath(pv.visitorId, pv.lineId));
    if (!body) return notFoundJson();
    return new Response(new Uint8Array(body), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  }
  const f = parseFileId(id);
  if (!f) return notFoundJson();
  let visitorId: string;
  let path: string | null;
  let type: string;
  if (f.kind === "photo") {
    const row = await storePhotoById(f.photoId);
    if (!row) return notFoundJson();
    [visitorId, path, type] = [row.visitor_id, row.storage_path, "image/jpeg"];
  } else {
    const gen = await generationById(f.generationId);
    const img = gen?.images[f.n];
    if (!gen || !img) return notFoundJson();
    [visitorId, path, type] = [gen.visitor_id, img.storage_path, "image/png"];
  }
  if (!path || !(await canSeeVisitorFile(await asker(), visitorId))) return notFoundJson();
  const body = await getObject("store-uploads", path);
  if (!body) return notFoundJson();
  return new Response(new Uint8Array(body), { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
