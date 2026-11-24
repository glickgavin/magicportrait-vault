import { notFound } from "next/navigation";
import { requireStoreVisible } from "@/lib/open-store/pages";
import { StoreCollectionPage } from "@/components/open-store/StoreCollectionPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magic Store" };

/** /store/c/<collection handle>: a category from the store's menu, narrowed to the Magic Store's products. */
export default async function StoreCategory({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ type?: string; sort?: string; page?: string }> }) {
  const user = await requireStoreVisible();
  const { handle } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(handle)) notFound();
  return <StoreCollectionPage user={user} handle={handle} searchParams={await searchParams} />;
}
