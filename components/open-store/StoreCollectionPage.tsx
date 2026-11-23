import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/auth/types";
import { storePageData, storeShell } from "@/lib/open-store/pages";
import { isSort } from "@/lib/open-store/view";
import { StoreFrame } from "./StoreFrame";
import { StorePage } from "./StorePage";

/** /store and /store/c/<handle>: one collection's page. */
export async function StoreCollectionPage({ user, handle, searchParams }: { user: SessionUser | null; handle: string | null; searchParams: { type?: string; sort?: string; page?: string } }) {
  const sort = isSort(searchParams.sort) ? searchParams.sort : "featured";
  const page = Math.min(20, Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1));
  const type = typeof searchParams.type === "string" ? searchParams.type.slice(0, 80) : null;
  const [data, shell] = await Promise.all([storePageData({ handle, type, sort, page }), storeShell()]);
  if (!data) notFound();
  const base = data.isHome ? "/store" : `/store/c/${data.collection.handle}`;
  return (
    <StoreFrame user={user} active={data.collection.handle}>
      <StorePage data={data} circles={shell.circles} base={base} sort={sort} page={page} />
    </StoreFrame>
  );
}
