import "server-only";
import { cookies } from "next/headers";
import { ENTRY_COOKIE } from "@/lib/auth/entry";
import { db, must } from "@/lib/db/client";
import { deleteShopRows } from "@/lib/db/shop";
import { visitorsForEmail } from "@/lib/db/store";
import { FIRST_TOUCH_COOKIE } from "@/lib/open-store/first-touch";
import { currentVisitor } from "@/lib/open-store/visitor";
import { VISITOR_COOKIE } from "@/lib/open-store/visitor-token";
import { removeObjects, type Bucket } from "@/lib/storage";
import { track } from "@/lib/track";

/**
 * "Start again as a new visitor" (Settings › Magic Store, for testing): a super user's own shopping state goes, as
 * if they had just arrived, while they stay signed in. Only their own: this browser's Magic Store visitor and the
 * visitors linked to their email, with their photos, pictures, previews and saved cart; their Gifts & Products
 * cart, remembered pictures and uploads; and the visitor, first-touch and entry cookies. Greeting cards, sign-in,
 * orders in Shopify and the activity log are untouched.
 */
export type TestResetResult = { visitors: number; pictures: number; files: number; shopCarts: number; shopImages: number };

/** Every file under a folder of a bucket (the store keeps photos/, pictures/<id>/ and previews/ per visitor). */
async function filesUnder(bucket: Bucket, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db().storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (!data?.length) break;
    for (const f of data) {
      const path = `${prefix}/${f.name}`;
      // Folders come back without an id.
      if (f.id) out.push(path);
      else out.push(...(await filesUnder(bucket, path, depth + 1)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function resetMyTestState(actor: { email: string }): Promise<TestResetResult> {
  const email = actor.email.trim().toLowerCase();
  const mine = new Map<string, true>();
  const here = await currentVisitor().catch(() => null);
  if (here) mine.set(here.id, true);
  for (const v of await visitorsForEmail(email)) mine.set(v.id, true);
  const ids = [...mine.keys()];

  let pictures = 0;
  let files = 0;
  if (ids.length) {
    pictures = (await db().from("store_generations").select("id", { count: "exact", head: true }).in("visitor_id", ids)).count ?? 0;
    for (const id of ids) {
      const keys = await filesUnder("store-uploads", id);
      for (let i = 0; i < keys.length; i += 100) await removeObjects("store-uploads", keys.slice(i, i + 100));
      files += keys.length;
    }
    // Photos and pictures go with the visitor (on delete cascade).
    must(await db().from("store_visitors").delete().in("id", ids).select("id"), "delete my store visitors");
  }

  const shop = await deleteShopRows(email);
  await removeObjects("shop-uploads", shop.uploadPaths);
  files += shop.uploadPaths.length;

  const jar = await cookies();
  for (const name of [VISITOR_COOKIE, FIRST_TOUCH_COOKIE, ENTRY_COOKIE]) if (jar.get(name)) jar.delete(name);

  const result = { visitors: ids.length, pictures, files, shopCarts: shop.carts, shopImages: shop.images };
  await track("admin_test_reset", { visitors: result.visitors, pictures, files, shop_carts: shop.carts, shop_images: shop.images }, { email, actor: `super_user:${email}` });
  return result;
}
