import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/shop";
import { rulesFor } from "@/lib/shop/admin";
import { parseVariantRules } from "@/lib/shop/rules";
import { getSettings } from "@/lib/settings";
import { ShopRulesEditor } from "@/components/admin/shop/ShopRulesEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: print rules" };

/** Settings › Shop › Print rules: what each size is made from (maker, code, print area) and which pictures suit it. */
export default async function ShopRulesPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireSuperUser();
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) notFound();
  let entries;
  try {
    entries = await getCatalog({ fresh: true });
  } catch {
    return (
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Print rules</h1>
        <p role="alert" className="mt-2 text-[15px] text-[#a1251b]">
          Couldn&apos;t read Shopify just now. Try again in a minute.
        </p>
      </div>
    );
  }
  const entry = entries.find((e) => e.product.legacyId === productId);
  if (!entry) notFound();
  const p = entry.product;
  const s = await getSettings(["shop.default_min_short_side_px", "shop.default_max_crop_pct"] as const);
  const defaults = { minShortSidePx: s["shop.default_min_short_side_px"], maxCropPct: s["shop.default_max_crop_pct"] };
  const sizes = p.variants.map((v) => {
    const r = parseVariantRules(v.metafields, defaults);
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      availableForSale: v.availableForSale,
      rules: rulesFor(v.metafields),
      status: r.ok ? "ready" : [r.missing.length ? `missing ${r.missing.join(", ")}` : "", r.invalid.length ? `invalid ${r.invalid.join(", ")}` : ""].filter(Boolean).join("; "),
    };
  });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/settings/shop" className="link text-[14px]">
          ← Shop
        </Link>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">Print rules: {p.title}</h1>
        <p className="mt-1 max-w-[760px] text-[15px] text-ink-2">
          What each size is made from and which pictures suit it. A size shows in the shop once it has a maker, the maker&apos;s product code and the print area. Saved to the size&apos;s shop fields in Shopify (mmp_shop); nothing else on the product changes.
        </p>
      </div>
      <ShopRulesEditor productId={p.id} sizes={sizes} defaults={defaults} />
    </div>
  );
}
