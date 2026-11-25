import "server-only";
import { z } from "zod";
import { productRows, updateStoreFields } from "@/lib/open-store/admin";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/track";
import { updateProductFields, type AdminResult } from "./admin";
import { COPY_PARTS, planCopy } from "./copy-settings";
import { normalisePage } from "./fields";
import { invalidateCatalog } from "./index";
import { getShopCatalogSource } from "./sources";

const productGid = z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/);
export const copySettingsSchema = z.object({ from: productGid, to: productGid, parts: z.array(z.enum(COPY_PARTS)).min(1).max(COPY_PARTS.length) }).refine((v) => v.from !== v.to, "Choose another product to copy from");

export type CopyResult = AdminResult & { copied?: string[]; skipped?: string[] };

/**
 * "Copy settings from…": copies another product's settings onto this one through the product page's own writers
 * (allowed write 5: `mmp_shop` fields only). Both products must be in the Store or Magic Store collection.
 */
export async function copySettings(actor: { email: string }, input: z.infer<typeof copySettingsSchema>): Promise<CopyResult> {
  const all = await productRows();
  if (!all.ok) return { ok: false, status: 502, error: all.error };
  const from = all.rows.find((r) => r.product.id === input.from);
  const to = all.rows.find((r) => r.product.id === input.to);
  if (!from || !to) return { ok: false, status: 404, error: "Both products must be in the Store or Magic Store collection." };
  const plan = planCopy(from.product, to.product, input.parts);
  const copied: string[] = [];
  const skipped = [...plan.skipped];

  if (plan.template) {
    // The background is this product's own photo; the rest was already checked when it was published on the other.
    const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
    const r = await (await getShopCatalogSource()).setProductTemplate(to.product.id, ns, JSON.stringify({ ...plan.template, updated_at: new Date().toISOString() }));
    if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the template (${r.reason}).` };
    copied.push("template");
  }

  if (plan.fields || plan.variants.length) {
    const r = await updateStoreFields(actor, { productId: to.product.id, fields: plan.fields ?? {}, variants: plan.variants });
    if (!r.ok) return { ...r, copied };
    if (plan.fields) copied.push("magic_store");
    if (plan.variants.length) copied.push("sizes");
  }

  if (plan.pages) {
    if (!to.shop) skipped.push("This product isn't in the Store collection, so its Gifts & Products fields weren't set.");
    else {
      const page = normalisePage(plan.pages.page) ?? "none";
      const r = await updateProductFields(actor, { productId: to.product.id, page, occasions: plan.pages.occasions, categories: plan.pages.categories });
      if (!r.ok) return { ...r, copied };
      copied.push("pages");
    }
  }

  await invalidateCatalog();
  await track("admin_shop_settings_copied", { product_id: to.product.legacyId, from_product_id: from.product.legacyId, parts: copied, skipped: skipped.length }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true, copied, skipped };
}
