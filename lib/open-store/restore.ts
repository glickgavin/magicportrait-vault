import "server-only";
import { latestDoneGeneration, storePhotosFor, visitorsForEmail } from "@/lib/db/store";
import { asker, ownsVisitor } from "./owner";
import { generationFor, generationView, photoFileId, type GenerationView } from "./pictures";

/**
 * Restore on return (docs/open-store.md › Creating the picture, On more gifts): the picture to show when the page
 * opens, either the one carried over from another product (`?g=`) or the newest one made for this product, and
 * the visitor's earlier photos to offer again. Nothing for a browser without a visitor.
 */
export async function pictureForPage(productGid: string, carried: string | null): Promise<{ picture: GenerationView | null; photos: { fileId: string; width: number; height: number }[] }> {
  const a = await asker();
  // Signed in: the pictures and photos of every visitor linked to their email too (another device).
  const ids = [...new Set([...(a.visitor ? [a.visitor.id] : []), ...(a.user ? (await visitorsForEmail(a.user.email)).map((v) => v.id) : [])])];
  if (!ids.length) return { picture: null, photos: [] };
  let gen = null;
  if (carried) {
    const g = await generationFor(carried);
    if (g && g.status === "done" && (await ownsVisitor(a, g.visitor_id))) gen = g;
  }
  gen ??= await latestDoneGeneration(ids, productGid);
  const photos = await storePhotosFor(ids, 6);
  return {
    picture: gen && gen.images.length ? await generationView(gen) : null,
    photos: photos.map((p) => ({ fileId: photoFileId(p.id), width: p.width, height: p.height })),
  };
}
