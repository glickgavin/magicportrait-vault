import { notFound } from "next/navigation";
import { ideasData, requireShopUser } from "@/lib/shop/pages";
import { IdeasView } from "@/components/shop/IdeasView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product ideas" };

/** Product ideas for one of the signed-in person's own pictures (an opaque id, checked against their list). */
export default async function Page({ params, searchParams }: { params: Promise<{ imageId: string }>; searchParams: Promise<{ product?: string }> }) {
  const { imageId } = await params;
  const user = await requireShopUser(`/products/i/${imageId}`);
  const data = await ideasData(user, "products", imageId);
  if (!data) notFound();
  const sp = await searchParams;
  const open = typeof sp.product === "string" && /^[a-z0-9-]{1,120}$/.test(sp.product) ? sp.product : null;
  return <IdeasView page="products" picture={data.picture} top={data.top} rest={data.rest} others={data.others} pricing={data.pricing} sizeKnown={data.sizeKnown} open={open} maxQty={data.maxQty} />;
}
