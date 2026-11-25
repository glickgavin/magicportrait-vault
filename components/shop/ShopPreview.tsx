"use client";

import { useEffect, useRef, useState } from "react";
import { drawPreview, previewSize, type MakeCanvas, type PreviewCtx } from "@/lib/shop/preview";
import type { Template } from "@/lib/shop/template";
import { cssFamily, ensureFonts } from "@/lib/render/fonts-browser";
import { layerActive, type LayerValues } from "@/lib/shop/layer";
import { cn } from "@/lib/utils";

const images = new Map<string, Promise<HTMLImageElement>>();
/** One load per URL for the whole page, so redrawing five previews doesn't fetch five times. */
export function loadImage(url: string, cors = false): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const i = new Image();
      if (cors) i.crossOrigin = "anonymous";
      i.decoding = "async";
      i.onload = () => resolve(i);
      i.onerror = () => {
        images.delete(url);
        reject(new Error("image"));
      };
      i.src = url;
    });
    images.set(url, p);
  }
  return p;
}

const makeCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
};

export type PreviewProps = {
  template: Template;
  pictureUrl: string;
  crop: { x: number; y: number; w: number; h: number };
  placement: "cover" | "contain" | "wrap_zone";
  aspect: number;
  background: string | null;
  /** CSS width the canvas is drawn for; it's drawn at device pixels. */
  width: number;
  /** The size the crop is measured in; when the loaded file differs, the crop is scaled to it. */
  pictureSize?: { width: number; height: number } | null;
  alt: string;
  className?: string;
  /** What the customer filled in on the template's personalisation layer, and its pictures (id → URL). */
  layer?: { values: LayerValues; art: { id: string; url: string }[] } | null;
};

/** A product preview drawn in the browser with the same routine the server uses for the order line. */
export function ShopPreview({ template, pictureUrl, crop, placement, aspect, background, width, pictureSize, alt, className, layer }: PreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify([template, pictureUrl, crop, placement, aspect, background, width, pictureSize, layer]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const on = layerActive(template.layer) && layer ? template.layer : null;
        const artUrl = on && layer?.values.art ? layer.art.find((a) => a.id === layer.values.art)?.url : undefined;
        const [bg, ov, pic, art] = await Promise.all([
          loadImage(template.background.url),
          template.overlay ? loadImage(template.overlay.url) : Promise.resolve(null),
          loadImage(pictureUrl),
          artUrl ? loadImage(artUrl, true).catch(() => null) : Promise.resolve(null),
          on ? ensureFonts(on.texts.map((x) => x.font)) : Promise.resolve(),
        ]);
        if (cancelled || !ref.current) return;
        const layerDraw = on && layer ? { layer: on, values: layer.values, art: new Map(art && layer.values.art ? [[layer.values.art, art]] : []), family: cssFamily } : null;
        const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
        const size = previewSize(template, Math.round(width * dpr));
        const el = ref.current;
        el.width = size.w;
        el.height = size.h;
        const kx = pictureSize ? pic.naturalWidth / pictureSize.width : 1;
        const ky = pictureSize ? pic.naturalHeight / pictureSize.height : 1;
        const c = kx === 1 && ky === 1 ? crop : { x: crop.x * kx, y: crop.y * ky, w: crop.w * kx, h: crop.h * ky };
        drawPreview(el.getContext("2d") as unknown as PreviewCtx, { template, background: bg, overlay: ov, picture: pic, crop: c, placement, backgroundColour: background, targetAspect: aspect, size, makeCanvas, flatMax: Math.min(1200, size.w), layer: layerDraw });
        setReady(true);
      } catch {
        setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt}
      data-preview="true"
      className={cn("ph-no-capture block w-full rounded-[14px] bg-black/[0.05] transition-opacity", ready ? "opacity-100" : "animate-pulse opacity-60", className)}
      data-ph-mask
      style={{ aspectRatio: `${template.background.w} / ${template.background.h}` }}
    />
  );
}
