import { requireStoreVisible } from "@/lib/open-store/pages";
import { StoreCollectionPage } from "@/components/open-store/StoreCollectionPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Magic Store" };


/** /store: the home collection (open_store.home_collection). 404 while the store is hidden (proxy.ts, and here). */
export default async function StoreHome({ searchParams }: { searchParams: Promise<{ type?: string; sort?: string; page?: string }> }) {
  const user = await requireStoreVisible();
  return <StoreCollectionPage user={user} handle={null} searchParams={await searchParams} />;
}
