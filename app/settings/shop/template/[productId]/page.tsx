import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/shop";
import { target } from "@/lib/shop/fit";
import { parseVariantRules } from "@/lib/shop/rules";
import { parseTemplate } from "@/lib/shop/template";
import { ShopTemplateEditor } from "@/components/admin/shop/ShopTemplateEditor";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: preview template" };

export default async function ShopTemplatePage({ params }: { params: Promise<{ productId: string }> }) {
  await requireSuperUser();
  const { productId } = await params;
  if (!/^\d{1,20}$/.test(productId)) notFound();
  let entries;
  try {
    entries = await getCatalog({ fresh: true });
  } catch {
    return (
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Preview template</h1>
        <p role="alert" className="mt-2 text-[15px] text-[#a1251b]">
          Couldn&apos;t read Shopify just now. Try again in a minute.
        </p>
      </div>
    );
  }
  const entry = entries.find((e) => e.product.legacyId === productId);
  if (!entry) notFound();
  const p = entry.product;
  // Every size with rules, so the test renders and the shape warning use real print areas.
  const sizes = p.variants.flatMap((v) => {
    const r = parseVariantRules(v.metafields);
    if (!r.ok) return [];
    const t = target(r.rules);
    return [{ id: v.id, title: v.title, aspect: t.w / t.h, placement: r.rules.placement, background: r.rules.background }];
  });
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_template" }} />
      <Link href="/settings/shop" className="link text-[14px] font-bold">
        ← Shop: products &amp; discounts
      </Link>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">Preview template: {p.title}</h1>
      <p className="text-[15px] text-ink-2">Pick the photo of the blank product, then drag the corners to where the picture goes. It stays a draft on this computer until you publish it to Shopify.</p>
      {p.media.length === 0 ? (
        <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1d6] p-4 text-[15px] text-[#7a4a00]">
          This product has no photos in Shopify. Add a photo of the blank product there first.
        </p>
      ) : (
        <div className="mt-5">
          <ShopTemplateEditor productId={p.id} media={p.media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, width: m.width ?? 1000, height: m.height ?? 1000 }))} published={parseTemplate(p.template?.value)} sizes={sizes} />
        </div>
      )}
    </div>
  );
}
