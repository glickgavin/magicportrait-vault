import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { productRows } from "@/lib/open-store/admin";
import { pendingClones } from "@/lib/shop/clone";
import { CloneProduct } from "@/components/admin/shop/CloneProduct";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: clone a product" };

/** Settings › Shop › Clone a product: a master product copied under a new name with another Imagen theme. */
export default async function ClonePage({ searchParams }: { searchParams: Promise<{ master?: string }> }) {
  await requireSuperUser();
  const [all, pending, sp] = await Promise.all([productRows(), pendingClones().catch(() => []), searchParams]);
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_clone" }} />
      <Link href="/settings/shop" className="link text-[14px] font-bold">
        ← Shop: products &amp; discounts
      </Link>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">Clone a product</h1>
      <p className="max-w-[720px] text-[15px] text-ink-2">Make a new product from a master: the same Dreamship product, sizes, prices, preview template and store settings, with a new name and another Imagen theme. It arrives as a draft in Shopify, so customers don&apos;t see it until you make it active there.</p>
      {!all.ok ? (
        <p role="alert" className="mt-4 text-[15px] text-[#a1251b]">
          Couldn&apos;t read Shopify just now ({all.error}). Try again in a minute.
        </p>
      ) : (
        <CloneProduct
          masters={all.rows.filter((r) => r.store && r.product.dreamshipProductId).map((r) => ({ id: r.product.legacyId, title: r.product.title, image: r.product.media[0]?.url ?? null, theme: r.product.store?.imagenTheme ?? null }))}
          themes={(all.themes ?? []).filter((t) => t.active).map((t) => ({ slug: t.slug, name: t.name }))}
          pending={pending.map((c) => ({ ...c, masterTitle: all.rows.find((r) => r.product.legacyId === c.masterId)?.product.title ?? null }))}
          initialMaster={typeof sp.master === "string" && /^\d{1,20}$/.test(sp.master) ? sp.master : null}
        />
      )}
    </div>
  );
}
