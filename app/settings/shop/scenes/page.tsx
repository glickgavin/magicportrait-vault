import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/shop";
import { listScenes } from "@/lib/shop/scenes";
import { dayStamp } from "@/lib/shop/scene-presets";
import { getSettings } from "@/lib/settings";
import { SceneStudio } from "@/components/admin/shop/SceneStudio";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop: AI room photos" };

export default async function ShopScenesPage() {
  await requireSuperUser();
  const s = await getSettings(["shop.scene_presets", "shop.scene_products", "shop.scene_sample_pictures", "shop.scene_daily_limit", "shop.scene_model", "shop.scene_image_size"] as const);
  const presets = s["shop.scene_presets"];
  const handles = [...new Set(presets.map((p) => p.product))];
  const [scenes, entries] = await Promise.all([listScenes(handles), getCatalog().catch(() => null)]);
  const titles = Object.fromEntries(handles.map((h) => [h, entries?.find((e) => e.product.handle === h)?.product.title ?? h]));
  const missing = handles.filter((h) => !s["shop.scene_products"].some((p) => p.handle === h) || (entries && !entries.some((e) => e.product.handle === h)));
  const today = dayStamp();
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "shop_scenes" }} />
      <Link href="/settings/shop" className="link text-[14px] font-bold">
        ← Shop: products &amp; discounts
      </Link>
      <h1 className="mt-1 text-[30px] font-extrabold tracking-tight">AI room photos</h1>
      <p className="max-w-[860px] text-[15px] text-ink-2">
        Lifestyle photos of the Store products in furnished rooms, made by an image model from each product&apos;s studio photo and a sample picture. Each one takes about 30–60 seconds and is charged to the team&apos;s Vercel AI Gateway. The scenes and the wording sent to the model are in Settings (shop.scene_presets, shop.scene_products, shop.scene_prompt_rules).
      </p>
      {missing.length > 0 && (
        <p role="alert" className="mt-3 rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] text-[#7a4a00]">
          No product description or no Store product for: {missing.join(", ")}. Their scenes can&apos;t be made until that&apos;s fixed.
        </p>
      )}
      <div className="mt-5">
        <SceneStudio
          presets={presets}
          titles={titles}
          pictures={s["shop.scene_sample_pictures"]}
          initial={scenes}
          usedToday={scenes.filter((x) => x.day === today).length}
          dailyLimit={s["shop.scene_daily_limit"]}
          model={`${s["shop.scene_model"]} · ${s["shop.scene_image_size"]}`}
        />
      </div>
    </div>
  );
}
