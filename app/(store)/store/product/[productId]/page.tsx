import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { productPageData, requireStoreVisible } from "@/lib/open-store/pages";
import { pictureForPage } from "@/lib/open-store/restore";
import { getSettings } from "@/lib/settings";
import { StoreFrame } from "@/components/open-store/StoreFrame";
import { ProductView } from "@/components/open-store/ProductView";

export const dynamic = "force-dynamic";

const FROM = ["grid", "related", "cart", "email_link", "direct"] as const;

/** The product's SEO title and description; the Open Graph image is its placeholder, never a visitor's picture. */
export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) return { title: "Magic Store" };
  const d = await productPageData(productId).catch(() => null);
  if (!d) return { title: "Magic Store" };
  const title = d.product.seoTitle ?? (d.theme ? `${d.product.title} · ${d.theme.name}` : d.product.title);
  return { title, description: d.product.seoDescription ?? undefined, openGraph: { title, description: d.product.seoDescription ?? undefined, images: d.gallery[0] ? [d.gallery[0].url] : [] } };
}

/**
 * /store/product/<Shopify product id> (docs/open-store.md › Product page). `?g=<picture id>` carries a picture over
 * from another product (On more gifts); without it, the newest picture made for this product comes back.
 */
export default async function StoreProduct({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ variant?: string; from?: string; g?: string }> }) {
  const user = await requireStoreVisible();
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) notFound();
  const [data, sp, s] = await Promise.all([productPageData(productId), searchParams, getSettings(["open_store.min_photo_px", "shop.upload_max_mb", "open_store.upload_max_px", "open_store.ask_email_while_painting"] as const)]);
  if (!data) notFound();
  const initial = data.variants.find((v) => v.legacyId === sp.variant && v.available)?.id ?? null;
  const restored = await pictureForPage(data.product.id, typeof sp.g === "string" ? sp.g : null);
  const from = (FROM as readonly string[]).includes(sp.from ?? "") ? sp.from! : "direct";
  return (
    <StoreFrame user={user} active={null}>
      <ProductView data={data} initialVariantId={initial} minPhotoPx={s["open_store.min_photo_px"]} maxMb={s["shop.upload_max_mb"]} uploadMaxPx={s["open_store.upload_max_px"]} from={from} initialPicture={restored.picture} earlierPhotos={restored.photos} askEmail={s["open_store.ask_email_while_painting"]} />
    </StoreFrame>
  );
}
