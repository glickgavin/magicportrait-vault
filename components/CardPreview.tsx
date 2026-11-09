"use client";

import { useEffect, useRef, useState } from "react";
import { drawLayers, type Ctx, type DrawImage } from "@/lib/render/draw";
import type { Crop, FontName, Layout } from "@/lib/render/layout";
import { fontFiles } from "@/lib/render/fonts";
import { cn } from "@/lib/utils";

export type CardPreviewProps = {
  layout: Layout;
  backgroundUrl: string | null;
  overlayUrl?: string | null;
  portraitUrl?: string | null;
  crop?: Crop;
  to: string;
  from: string;
  message: string;
  footerText?: string;
  photoBg?: string;
  label: string;
  className?: string;
  /** Draw at most this many CSS px wide (keeps small tiles cheap). */
  maxWidth?: number;
  priority?: boolean;
};

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** The brand fonts come from next/font (renamed families); the Google Fonts load from public/fonts/card/. */
function cssFamily(f: FontName): string {
  if (f !== "DM Serif Display" && f !== "Plus Jakarta Sans") return `"${f}"`;
  const v = f === "DM Serif Display" ? "--font-dmserif" : "--font-jakarta";
  const fromVar = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "";
  return fromVar || `"${f}"`;
}

let brandFonts: Promise<void> | null = null;
const faceLoads = new Map<string, Promise<void>>();
/** Loads only the fonts this layout uses (each file once per page), so previews stay cheap. */
function ensureFonts(layout: Layout) {
  brandFonts ??= Promise.all([
    document.fonts.load(`400 40px ${cssFamily("DM Serif Display")}`),
    document.fonts.load(`500 40px ${cssFamily("Plus Jakarta Sans")}`),
    document.fonts.load(`600 40px ${cssFamily("Plus Jakarta Sans")}`),
  ]).then(() => undefined, () => undefined);
  const used = new Set<FontName>([layout.text.to.font, layout.text.message.font, layout.text.from.font]);
  const faces = [...used].flatMap((f) =>
    fontFiles(f).map(({ weight, file }) => {
      let p = faceLoads.get(file);
      if (!p) {
        const face = new FontFace(f, `url(${file})`, { weight: String(weight) });
        p = face.load().then((loaded) => void document.fonts.add(loaded), () => undefined);
        faceLoads.set(file, p);
      }
      return p;
    }),
  );
  return Promise.all([brandFonts, ...faces]).then(() => undefined);
}

/**
 * The card at any size, drawn with the same routine as the server JPEG (lib/render/draw.ts).
 * Masked in session replay: it shows the message.
 */
export function CardPreview(props: CardPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { layout, backgroundUrl, overlayUrl, portraitUrl, crop, to, from, message, footerText, photoBg, maxWidth } = props;
  useEffect(() => {
    if (!width || !ref.current) return;
    let cancelled = false;
    const canvas = ref.current;
    (async () => {
      const [bg, ov, pt] = await Promise.all([loadImg(backgroundUrl), loadImg(overlayUrl), loadImg(portraitUrl), ensureFonts(layout)]);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.min(width, maxWidth ?? 2000);
      const w = Math.round(cssW * dpr);
      const h = Math.round((w * layout.canvas.h) / layout.canvas.w);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(w / layout.canvas.w, h / layout.canvas.h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawLayers(
        ctx as unknown as Ctx,
        { layout, background: bg as DrawImage | null, overlay: ov as DrawImage | null, portrait: pt as DrawImage | null, crop, to, from, message, footerText, photoBg },
        cssFamily,
        (px) => {
          (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
        },
      );
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [width, layout, backgroundUrl, overlayUrl, portraitUrl, crop, to, from, message, footerText, photoBg, maxWidth]);

  return (
    <div
      ref={wrap}
      className={cn("ph-no-capture relative w-full overflow-hidden rounded-[6px] bg-[#F5F1E6] shadow-[0_8px_24px_rgba(0,0,0,0.14)]", props.className)}
      style={{ aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}` }}
      data-ph-mask
    >
      <canvas ref={ref} role="img" aria-label={props.label} className={cn("block h-full w-full transition-opacity", ready ? "opacity-100" : "opacity-0")} />
      {!ready && <div className="skeleton absolute inset-0" aria-hidden="true" />}
    </div>
  );
}
