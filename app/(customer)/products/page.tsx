import { landingData, landingPictures, requireShopUser } from "@/lib/shop/pages";
import { ShopLanding } from "@/components/shop/ShopLanding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

/** /products (docs/shop.md): 404 while the shop is hidden from this person. */
export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string; pic?: string }> }) {
  const user = await requireShopUser("/products");
  const { filter, pic } = await searchParams;
  // Started now so the pictures are read while the products are; the previews stream in when ready.
  const pictures = landingPictures(user, "products", typeof pic === "string" ? pic.slice(0, 120) : null);
  return <ShopLanding page="products" data={await landingData(user, "products", typeof filter === "string" ? filter.slice(0, 60) : null)} pictures={pictures} />;
}
