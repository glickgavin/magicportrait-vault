import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export class ImageFetchError extends Error {}

const MAX_BYTES = 30 * 1024 * 1024;

/**
 * Fetches an image only from an allowed host (redeem.allowed_image_hosts) over https, with a size cap
 * and no redirects to other hosts. In fixtures mode, /fixtures/… paths are read from public/.
 */
export async function fetchAllowedImage(url: string, allowedHosts: string[]): Promise<{ body: Buffer; contentType: string }> {
  if (env.dataSource === "fixtures" && url.startsWith("/fixtures/")) {
    const rel = path.normalize(url).replace(/^(\.\.[/\\])+/, "");
    if (!rel.startsWith("/fixtures/")) throw new ImageFetchError("bad_path");
    const body = await readFile(path.join(process.cwd(), "public", rel)).catch(() => null);
    if (!body) throw new ImageFetchError("missing");
    return { body, contentType: rel.endsWith(".png") ? "image/png" : "image/jpeg" };
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ImageFetchError("bad_url");
  }
  if (u.protocol !== "https:" || !allowedHosts.includes(u.hostname.toLowerCase())) throw new ImageFetchError("host_not_allowed");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(u, { redirect: "manual", signal: ctrl.signal, cache: "no-store" });
    if (res.status >= 300) throw new ImageFetchError(`upstream_${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new ImageFetchError("too_large");
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) throw new ImageFetchError("too_large");
    return { body, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  } catch (e) {
    if (e instanceof ImageFetchError) throw e;
    throw new ImageFetchError("upstream_failed");
  } finally {
    clearTimeout(timer);
  }
}
