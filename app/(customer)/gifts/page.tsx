import { landingData, requireShopUser } from "@/lib/shop/pages";
import { ShopLanding } from "@/components/shop/ShopLanding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gifts" };

/** /gifts (docs/shop.md): 404 while the shop is hidden from this person. */
export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireShopUser("/gifts");
  const { filter } = await searchParams;
  return <ShopLanding page="gifts" data={await landingData(user, "gifts", typeof filter === "string" ? filter.slice(0, 60) : null)} />;
}
