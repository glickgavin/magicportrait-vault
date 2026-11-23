import type { ShopProduct, ShopVariant } from "../shop/sources/types";
import { PRODUCT_FIELDS, type ProductFieldDef, type ProductFieldKey } from "./registry";

/**
 * Pure: a product or variant field's stored value from its mmp_shop metafields, checked by the same Zod rule
 * Settings uses (docs/open-store.md › Product settings use the store's settings framework). No I/O; the store
 * fallback is applied by getProductSetting() in lib/settings/product.ts.
 */
export type FieldRead<T> = { state: "set"; value: T } | { state: "unset" } | { state: "invalid"; raw: unknown; problem: string };

const def = (key: ProductFieldKey) => PRODUCT_FIELDS[key] as unknown as ProductFieldDef<unknown>;

/** The `generation` JSON, or a problem when it isn't a JSON object. */
export function parseGeneration(raw: string | null | undefined): { ok: true; value: Record<string, unknown> } | { ok: false; problem: string } {
  if (!raw?.trim()) return { ok: true, value: {} };
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as Record<string, unknown> };
  } catch {
    /* below */
  }
  return { ok: false, problem: "Picture settings aren't a JSON object" };
}

/** The raw stored value (before checking), or undefined when the product has none. */
export function rawProductField(product: ShopProduct, key: ProductFieldKey): unknown {
  const d = def(key);
  if (d.scope !== "product") throw new Error(`${key} is a variant field`);
  const st = product.store;
  switch (d.metafield) {
    case "short_description":
      return product.shortDescription?.trim() ? product.shortDescription : undefined;
    case "imagen_theme":
      return st?.imagenTheme?.trim() ? st.imagenTheme.trim() : undefined;
    case "related":
      return st?.related?.length ? st.related : undefined;
    case "open_store_related":
      return st?.relatedOnly == null || st.relatedOnly === "" ? undefined : st.relatedOnly === "true" ? true : st.relatedOnly === "false" ? false : st.relatedOnly;
    case "details":
      return st?.details?.trim() ? st.details : undefined;
    case "generation": {
      const g = parseGeneration(st?.generation);
      return g.ok ? g.value[d.jsonKey!] : undefined;
    }
  }
  return undefined;
}

export function readProductField<K extends ProductFieldKey>(product: ShopProduct, key: K): FieldRead<unknown> {
  const raw = rawProductField(product, key);
  if (raw === undefined) return { state: "unset" };
  const r = def(key).schema.safeParse(raw);
  return r.success ? { state: "set", value: r.data } : { state: "invalid", raw, problem: r.error.issues[0]?.message ?? "Not a valid value" };
}

export function readVariantField(variant: ShopVariant, key: ProductFieldKey): FieldRead<unknown> {
  const d = def(key);
  if (d.scope !== "variant") throw new Error(`${key} is a product field`);
  const raw = variant.metafields.find((m) => m.key === d.metafield)?.value?.trim();
  if (!raw) return { state: "unset" };
  const r = d.schema.safeParse(raw);
  return r.success ? { state: "set", value: r.data } : { state: "invalid", raw, problem: r.error.issues[0]?.message ?? "Not a valid value" };
}

/** Every bad value set on a product (or its variants), for the product table and the one product page. */
export function productFieldProblems(product: ShopProduct): { key: string; label: string; problem: string }[] {
  const out: { key: string; label: string; problem: string }[] = [];
  const g = parseGeneration(product.store?.generation);
  if (!g.ok) out.push({ key: "generation", label: "Picture settings", problem: g.problem });
  for (const key of Object.keys(PRODUCT_FIELDS) as ProductFieldKey[]) {
    const d = def(key);
    if (d.scope === "product") {
      const r = readProductField(product, key);
      if (r.state === "invalid") out.push({ key, label: d.label, problem: r.problem });
    } else {
      for (const v of product.variants) {
        const r = readVariantField(v, key);
        if (r.state === "invalid") out.push({ key, label: `${d.label} (${v.title})`, problem: r.problem });
      }
    }
  }
  return out;
}
