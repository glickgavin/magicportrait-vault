import { json, notFoundJson } from "@/lib/auth/http";
import { shopUserOrNull } from "@/lib/shop";
import { listPictures, pictureLink } from "@/lib/shop/pictures";
import type { ShopImage } from "@/lib/shop/images";

export const dynamic = "force-dynamic";

async function view(i: ShopImage) {
  return { id: i.id, kind: i.kind, url: await pictureLink(i), ordered: i.ordered, width: i.width, height: i.height, createdAt: i.createdAt };
}

/** Choose a picture: the signed-in person's portraits and photos. 404 while the shop is hidden from them. */
export async function GET() {
  const u = await shopUserOrNull();
  if (!u) return notFoundJson();
  const list = await listPictures(u.email, true);
  return json({ portraits: await Promise.all(list.portraits.map(view)), photos: await Promise.all(list.photos.map(view)), partial: list.partial });
}
