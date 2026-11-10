import { getSettings } from "@/lib/settings";
import { choosePictureData, requireShopUser } from "@/lib/shop/pages";
import { ChoosePicture } from "@/components/shop/ChoosePicture";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a picture" };

export default async function Page({ searchParams }: { searchParams: Promise<{ product?: string; tab?: string }> }) {
  const user = await requireShopUser("/gifts/choose");
  const sp = await searchParams;
  const [data, s] = await Promise.all([choosePictureData(user), getSettings(["shop.upload_max_mb", "shop.upload_min_short_side_px"] as const)]);
  const tab = sp.tab === "photos" || sp.tab === "upload" ? sp.tab : "portraits";
  const product = typeof sp.product === "string" && /^[a-z0-9-]{1,120}$/.test(sp.product) ? sp.product : null;
  return (
    <>
      <TrackPageView event="page_view_shop_choose" props={{ page: "gifts", portraits: data.portraits.length, photos: data.photos.length }} />
      <ChoosePicture page="gifts" product={product} tab={tab} portraits={data.portraits} photos={data.photos} partial={data.partial} maxMb={s["shop.upload_max_mb"]} minPx={s["shop.upload_min_short_side_px"]} />
    </>
  );
}
