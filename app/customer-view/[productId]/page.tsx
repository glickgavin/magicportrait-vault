import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/auth/session";
import { productPageData } from "@/lib/open-store/pages";
import { getSettings } from "@/lib/settings";
import { CustomerView } from "@/components/admin/shop/CustomerView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer view" };

/**
 * The template editor's customer view (docs/shop.md › Customer view): the Magic Store product page for one product,
 * shown inside the editor at phone and desktop size with a sample picture and the editor's unpublished template.
 * Super users only (404 otherwise); nothing here is tracked, made or added to a cart.
 */
export default async function CustomerViewPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ state?: string }> }) {
  await requireSuperUser();
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) notFound();
  const [data, sp, s] = await Promise.all([productPageData(productId).catch(() => null), searchParams, getSettings(["open_store.min_photo_px", "shop.upload_max_mb", "open_store.upload_max_px", "open_store.more_gifts_step", "shop.template_sample_pictures"] as const)]);
  if (!data)
    return (
      <main id="main" className="grid min-h-dvh place-items-center bg-white p-6 text-center text-[15px] text-ink-2" data-testid="customer-view-none">
        This product can&apos;t be shown in the Magic Store yet (it isn&apos;t in the Magic Store collection, or something on its settings page still hides it), so there&apos;s no customer view.
      </main>
    );
  return (
    <main id="main" className="min-h-dvh bg-white">
      <CustomerView data={data} sample={sp.state === "start" ? null : (s["shop.template_sample_pictures"][0] ?? null)} minPhotoPx={s["open_store.min_photo_px"]} maxMb={s["shop.upload_max_mb"]} uploadMaxPx={s["open_store.upload_max_px"]} moreGiftsStep={s["open_store.more_gifts_step"]} />
    </main>
  );
}
