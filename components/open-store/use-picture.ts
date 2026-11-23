"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** What the page sees of a picture (lib/open-store/pictures.ts › GenerationView). */
export type PictureView = {
  id: string;
  productId: string;
  status: "pending" | "preprocessing" | "generating" | "done" | "failed" | "timed_out";
  step: 0 | 1 | 2;
  slow: boolean;
  images: { file: string; width: number; height: number }[];
  chosen: number;
  photos: string[];
};

export type PicturePhase =
  | { phase: "idle" }
  | { phase: "creating"; step: 0 | 1 | 2; slow: boolean; id: string | null }
  | { phase: "ready"; picture: PictureView }
  | { phase: "failed" }
  | { phase: "limited"; count: number | null }
  | { phase: "busy" }
  | { phase: "refused"; slot: number; reason: string };

/** A photo for one slot: a file chosen now, or one added before (its file id, `p_…`). */
export type SlotPhoto = { file: File; url: string; width: number; height: number } | { fileId: string; url: string; width: number; height: number };

export const fileUrl = (fileId: string) => `/api/store/files/${fileId}`;

/** Shrinks a photo to `maxPx` on the long side as JPEG, in the browser; returns the file as is when it can't be read (HEIC). */
export async function shrinkPhoto(file: File, maxPx: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.type === "image/jpeg") {
      bmp.close();
      return file;
    }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.92));
  } catch {
    return file;
  }
}

const POLL_MS = 2000;

/**
 * Creating a picture (docs/open-store.md › Creating the picture): sends the photos, then asks every 2 s how it's
 * going until it's ready, failed or timed out (the server decides the time-out). `initial` restores one made before.
 */
export function usePicture(opts: { productId: string; uploadMaxPx: number; initial: PictureView | null; onEvent?: (e: "started" | "ready" | "failed" | "limited", p?: PictureView) => void }) {
  const [state, setState] = useState<PicturePhase>(opts.initial ? { phase: "ready", picture: opts.initial } : { phase: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const onEvent = useRef(opts.onEvent);
  useEffect(() => {
    onEvent.current = opts.onEvent;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const follow = useCallback((id: string) => {
    const tick = async () => {
      if (!alive.current) return;
      let view: PictureView | null = null;
      try {
        const r = await fetch(`/api/store/generations/${id}`, { cache: "no-store" });
        if (r.ok) view = ((await r.json()) as { generation: PictureView }).generation;
        else if (r.status === 404) {
          setState({ phase: "failed" });
          return;
        }
      } catch {
        /* a dropped request: ask again */
      }
      if (!alive.current) return;
      if (view?.status === "done" && view.images.length) {
        setState({ phase: "ready", picture: view });
        onEvent.current?.("ready", view);
        return;
      }
      if (view && (view.status === "failed" || view.status === "timed_out" || view.status === "done")) {
        setState({ phase: "failed" });
        onEvent.current?.("failed", view);
        return;
      }
      if (view) setState({ phase: "creating", step: view.step, slow: view.slow, id });
      timer.current = setTimeout(tick, POLL_MS);
    };
    timer.current = setTimeout(tick, POLL_MS);
  }, []);

  const create = useCallback(
    async (photos: SlotPhoto[], names: string[]) => {
      setState({ phase: "creating", step: 0, slow: false, id: null });
      onEvent.current?.("started");
      const form = new FormData();
      form.set("product", opts.productId);
      for (const [i, p] of photos.entries()) {
        if ("fileId" in p) form.set(`photoId${i}`, p.fileId);
        else form.set(`photo${i}`, await shrinkPhoto(p.file, opts.uploadMaxPx), "photo.jpg");
        form.set(`name${i}`, names[i] ?? "");
      }
      let r: Response;
      try {
        r = await fetch("/api/store/generations", { method: "POST", body: form });
      } catch {
        setState({ phase: "failed" });
        return;
      }
      const body = (await r.json().catch(() => ({}))) as { generation?: PictureView; error?: string; count?: number; slot?: number; reason?: string };
      if (!alive.current) return;
      if (r.ok && body.generation) {
        setState({ phase: "creating", step: 1, slow: false, id: body.generation.id });
        follow(body.generation.id);
        return;
      }
      if (body.error === "limit_visitor" || body.error === "limit_ip" || body.error === "rate_limited") {
        setState({ phase: "limited", count: body.count ?? null });
        onEvent.current?.("limited");
      } else if (body.error === "busy") setState({ phase: "busy" });
      else if (body.error === "photo_refused") setState({ phase: "refused", slot: body.slot ?? 0, reason: body.reason ?? "not_an_image" });
      else setState({ phase: "failed" });
    },
    [opts.productId, opts.uploadMaxPx, follow],
  );

  const choose = useCallback(async (picture: PictureView, n: number) => {
    setState({ phase: "ready", picture: { ...picture, chosen: n } });
    await fetch(`/api/store/generations/${picture.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ chosen: n }) }).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setState({ phase: "idle" });
  }, []);

  return { state, create, choose, reset };
}
