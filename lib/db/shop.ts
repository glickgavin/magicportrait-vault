import "server-only";
import { db, must } from "./client";
import type { ShopImageKind } from "@/lib/shop/images";

/** The shop's own rows (docs/schema.md › shop_*). Every read and write is scoped to the owner's email. */

export type ShopImageRow = {
  id: string;
  owner_email: string;
  kind: ShopImageKind;
  source_url: string | null;
  storage_path: string | null;
  source_ref: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

const COLS = "id, owner_email, kind, source_url, storage_path, source_ref, width, height, created_at";
const norm = (e: string) => e.trim().toLowerCase();

export async function insertNewUpload(email: string, input: { id: string; storagePath: string; width: number; height: number }): Promise<ShopImageRow> {
  return must(
    await db().from("shop_images").insert({ id: input.id, owner_email: norm(email), kind: "new_upload", storage_path: input.storagePath, width: input.width, height: input.height }).select(COLS).single(),
    "insert shop upload",
  ) as ShopImageRow;
}

export async function newUploadsFor(email: string, limit = 200): Promise<ShopImageRow[]> {
  return must(await db().from("shop_images").select(COLS).eq("owner_email", norm(email)).eq("kind", "new_upload").order("created_at", { ascending: false }).limit(limit), "list shop uploads") as ShopImageRow[];
}

/** Sizes we already measured for this person's external pictures, by URL. */
export async function knownSizes(email: string, urls: string[]): Promise<Map<string, { width: number; height: number; id: string }>> {
  const out = new Map<string, { width: number; height: number; id: string }>();
  if (!urls.length) return out;
  const rows = must(await db().from("shop_images").select("id, source_url, width, height").eq("owner_email", norm(email)).in("source_url", urls.slice(0, 500)), "shop image sizes") as Pick<ShopImageRow, "id" | "source_url" | "width" | "height">[];
  for (const r of rows) if (r.source_url && r.width && r.height) out.set(r.source_url, { width: r.width, height: r.height, id: r.id });
  return out;
}

/** Records an external picture the person used (its size, once measured). Returns our row id. */
export async function rememberExternalImage(email: string, input: { kind: Exclude<ShopImageKind, "new_upload">; url: string; ref: string | null; width: number | null; height: number | null }): Promise<string> {
  const row = must(
    await db()
      .from("shop_images")
      .upsert({ owner_email: norm(email), kind: input.kind, source_url: input.url, source_ref: input.ref, width: input.width, height: input.height }, { onConflict: "owner_email,source_url" })
      .select("id")
      .single(),
    "remember shop image",
  ) as { id: string };
  return row.id;
}

export async function newUploadById(email: string, id: string): Promise<ShopImageRow | null> {
  const r = await db().from("shop_images").select(COLS).eq("id", id).eq("owner_email", norm(email)).eq("kind", "new_upload").maybeSingle();
  return (r.data as ShopImageRow | null) ?? null;
}

/** Data deletion (Settings › Customers): every shop row for the email; returns upload paths to remove. */
export async function deleteShopRows(email: string): Promise<{ uploadPaths: string[]; carts: number; images: number }> {
  const e = norm(email);
  const first = await db().from("shop_images").select("id, storage_path").eq("owner_email", e);
  // Before the shop migration is applied there's nothing to delete; never let that break a deletion.
  if (first.error && (first.error.code === "PGRST205" || first.error.code === "42P01")) return { uploadPaths: [], carts: 0, images: 0 };
  const imgs = must(first, "shop images for delete") as { id: string; storage_path: string | null }[];
  const carts = must(await db().from("shop_carts").delete().eq("owner_email", e).select("id"), "delete shop carts") as { id: string }[];
  must(await db().from("shop_images").delete().eq("owner_email", e).select("id"), "delete shop images");
  return { uploadPaths: imgs.map((i) => i.storage_path).filter((p): p is string => Boolean(p)), carts: carts.length, images: imgs.length };
}
