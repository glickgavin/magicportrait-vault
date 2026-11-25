import "server-only";
import { loadImage, type Image } from "@napi-rs/canvas";
import { db } from "@/lib/db/client";
import { registerFonts } from "@/lib/render/render";
import type { FontName } from "@/lib/render/layout";
import { getObject } from "@/lib/storage";
import { layerActive, type Layer, type LayerDraw, type LayerValues } from "./layer";

/**
 * The personalisation layer on the server (cart previews and print files): the card fonts registered with
 * @napi-rs/canvas, and the chosen art library picture read from our own bucket (never fetched from a URL).
 */
const artCache = new Map<string, { at: number; img: Image }>();

async function artImage(id: string): Promise<Image | null> {
  const hit = artCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.img;
  const row = (await db().from("layer_art").select("storage_path").eq("id", id).maybeSingle()).data as { storage_path: string } | null;
  if (!row) return null;
  const buf = await getObject("theme-assets", row.storage_path);
  const img = buf ? await loadImage(buf).catch(() => null) : null;
  if (img) {
    if (artCache.size > 50) artCache.clear();
    artCache.set(id, { at: Date.now(), img });
  }
  return img;
}

/** Everything `drawLayer` needs, or null when the layer is off or nothing was filled in. */
export async function serverLayer(layer: Layer | null | undefined, values: LayerValues | null | undefined): Promise<LayerDraw | null> {
  if (!layerActive(layer) || !values) return null;
  registerFonts();
  const art = new Map<string, Image>();
  if (values.art && layer.art?.choices.includes(values.art)) {
    const img = await artImage(values.art);
    if (img) art.set(values.art, img);
  }
  return { layer, values, art, family: (f: FontName) => `"${f}"` };
}
