"use client";

import { useEffect, useState } from "react";
import { ProductView } from "@/components/open-store/ProductView";
import type { PictureView } from "@/components/open-store/use-picture";
import type { ProductPageData } from "@/lib/open-store/pages";
import { templateSchema, type Template } from "@/lib/shop/template";

export const DRAFT_MESSAGE = "mmp-template-draft";
export const READY_MESSAGE = "mmp-customer-view-ready";

/**
 * The product page as a customer sees it, inside the template editor's frame: the real page component with a sample
 * picture, redrawn with the editor's draft template each time it changes (sent by the editor, same site only).
 */
export function CustomerView({ data, sample, minPhotoPx, maxMb, uploadMaxPx, moreGiftsStep }: { data: ProductPageData; sample: string | null; minPhotoPx: number; maxMb: number; uploadMaxPx: number; moreGiftsStep: number }) {
  const [template, setTemplate] = useState<Template | null>(data.template);
  const [picture, setPicture] = useState<PictureView | null | undefined>(sample ? undefined : null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as { type?: string; template?: unknown } | null;
      if (m?.type !== DRAFT_MESSAGE) return;
      const r = templateSchema.safeParse(m.template);
      if (r.success) setTemplate(r.data);
    };
    window.addEventListener("message", onMessage);
    if (window.parent !== window) window.parent.postMessage({ type: READY_MESSAGE }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The sample picture's own size, so it's cropped as a customer's would be.
  useEffect(() => {
    if (!sample) return;
    const img = new Image();
    img.onload = () => setPicture({ id: "sample", productId: data.product.legacyId, status: "done", step: 2, slow: false, images: [{ file: sample, width: img.naturalWidth, height: img.naturalHeight }], chosen: 0, photos: [sample], names: [], emailAsked: true });
    img.onerror = () => setPicture(null);
    img.src = sample;
  }, [sample, data.product.legacyId]);

  if (picture === undefined) return null;
  return <ProductView key={picture ? "ready" : "start"} data={{ ...data, template, related: [] }} initialVariantId={null} minPhotoPx={minPhotoPx} maxMb={maxMb} uploadMaxPx={uploadMaxPx} from="direct" initialPicture={picture} earlierPhotos={[]} askEmail={false} moreGiftsStep={moreGiftsStep} demo />;
}
