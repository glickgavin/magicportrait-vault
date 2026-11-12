import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/shop";
import { LIBRARY_ROOMS, LIBRARY_STUDIO } from "@/lib/shop/photo-library";
import { PhotoLibrary } from "@/components/admin/shop/PhotoLibrary";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: photo library" };

export default async function ShopLibraryPage() {
  await requireSuperUser();
  // Each Store product's template editor, so a room can be opened straight in it.
  const entries = await getCatalog().catch(() => null);
  const editors = Object.fromEntries((entries ?? []).map((e) => [e.product.handle, `/settings/shop/template/${e.product.legacyId}`]));
  const photos = LIBRARY_ROOMS.reduce((n, r) => n + r.photos.length, 0);
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_library" }} />
      <Link href="/settings/shop" className="link text-[14px] font-bold">
        ← Shop: products &amp; discounts
      </Link>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">Photo library</h1>
      <p className="max-w-[860px] text-[15px] text-ink-2">
        Furnished rooms and studio photos for the Store products: {LIBRARY_ROOMS.length} rooms with {photos} photos, and {LIBRARY_STUDIO.length} studio photos. Each room is a ready template: open it in the product&apos;s template editor, check the live preview, then publish. The photos with sample pictures can be downloaded for product pages, emails and ads.
      </p>
      {!entries && (
        <p role="alert" className="mt-3 rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] text-[#7a4a00]">
          Couldn&apos;t read Shopify just now, so the links to the template editors are missing. Reload in a minute.
        </p>
      )}
      <div className="mt-5">
        <PhotoLibrary rooms={LIBRARY_ROOMS} studio={LIBRARY_STUDIO} editors={editors} />
      </div>
      <p className="mt-6 max-w-[860px] text-[13px] text-ink-2">
        The rooms use 3D models by Wayfair and the Khronos Group under CC BY 4.0. Where these photos are shown, add the credit line from scripts/mockups/ASSETS.md to a credits or About page.
      </p>
    </div>
  );
}
