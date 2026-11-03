import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/client";

export type Bucket = "theme-assets" | "portraits" | "cards";

export async function putObject(bucket: Bucket, key: string, body: Buffer, contentType: string) {
  const { error } = await db().storage.from(bucket).upload(key, body, { contentType, upsert: true, cacheControl: bucket === "theme-assets" ? "31536000" : "0" });
  if (error) throw new Error(`storage upload ${bucket}: ${error.message}`);
}

export async function getObject(bucket: Bucket, key: string): Promise<Buffer | null> {
  const { data, error } = await db().storage.from(bucket).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function objectExists(bucket: Bucket, key: string): Promise<boolean> {
  const dir = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const name = key.slice(key.lastIndexOf("/") + 1);
  const { data } = await db().storage.from(bucket).list(dir, { search: name, limit: 1 });
  return Boolean(data?.some((f) => f.name === name));
}

export async function removeObjects(bucket: Bucket, keys: string[]) {
  if (!keys.length) return;
  await db().storage.from(bucket).remove(keys);
}

/** Short-lived signed URL for a private file (never a permanent public link). */
export async function signedUrl(bucket: Bucket, key: string, seconds: number, download?: string): Promise<string | null> {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(key, seconds, download ? { download } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Theme artwork: `builtin:` placeholders ship with the app; everything else is in the theme-assets bucket. */
export async function loadThemeAsset(p: string | null | undefined): Promise<Buffer | null> {
  if (!p) return null;
  if (p.startsWith("builtin:")) {
    const rel = p.slice("builtin:".length).replace(/\.\.+/g, "");
    return readFile(path.join(process.cwd(), "public/theme-placeholders", rel)).catch(() => null);
  }
  return getObject("theme-assets", p.replace(/^theme-assets\//, ""));
}
