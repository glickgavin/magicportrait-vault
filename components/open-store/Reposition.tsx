"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadImage } from "@/components/shop/ShopPreview";
import { t } from "@/lib/i18n";
import { cssFamily, ensureFonts } from "@/lib/render/fonts-browser";
import { basePos, LAYER_SCALE, placeBox, type Layer, type LayerBox, type LayerPos, type LayerPosId, type LayerValues } from "@/lib/shop/layer";
import { flatPicture, type MakeCanvas, type PreviewCtx } from "@/lib/shop/preview";
import type { Template } from "@/lib/shop/template";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number };
/** The picture the print is shown with: their finished picture (with its crop), else the photo they added. */
export type RepositionPicture = { url: string; crop: Rect | null; size: { width: number; height: number } | null };
type Pos = Partial<Record<LayerPosId, LayerPos>>;
type Item = { id: LayerPosId; label: string; box: LayerBox; rotate: number };

const makeCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
};

/** The items a layer lets the customer move: each text box, and the picture slot. */
export function repositionItems(layer: Layer): Item[] {
  return [...layer.texts.map((x) => ({ id: x.id as LayerPosId, label: x.label, box: x.box, rotate: x.rotate ?? 0 })), ...(layer.art ? [{ id: "art" as const, label: layer.art.label, box: layer.art.box, rotate: 0 }] : [])];
}

/** Where an item is now: the customer's position, else the template's. */
const posOf = (item: Item, pos: Pos): LayerPos => pos[item.id] ?? basePos(item.box, item.rotate);

/**
 * "Reposition" (docs/open-store.md › Personalise): the print area with their picture and the layer, where they drag
 * an item to move it and turn or resize it with the sliders (or the arrow keys). It's drawn with the same routine as
 * the previews and the print file, so what they set is what's printed. Nothing is kept until Done.
 */
export function Reposition({
  open,
  onClose,
  layer,
  template,
  values,
  onSave,
  art,
  picture,
  placement,
  background,
  aspect,
  start,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  layer: Layer;
  template: Template;
  values: LayerValues;
  onSave: (pos: Pos) => void;
  art: { id: string; url: string }[];
  picture: RepositionPicture | null;
  placement: "cover" | "contain" | "wrap_zone";
  background: string | null;
  aspect: number;
  start: LayerPosId;
  productId: string;
}) {
  const uid = useId();
  const items = useMemo(() => repositionItems(layer), [layer]);
  const [draft, setDraft] = useState<Pos>(values.pos ?? {});
  const [current, setCurrent] = useState<LayerPosId>(start);
  useEffect(() => {
    if (!open) return;
    setDraft(values.pos ?? {});
    setCurrent(start);
    trackClient("store_reposition_opened", { product_id: productId, item: start });
    // Only on opening: the draft starts from what's saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const item = items.find((i) => i.id === current) ?? items[0];

  // What's drawn: their words (or the box's example when empty) at the draft positions.
  const shown: LayerValues = useMemo(() => {
    const v: LayerValues = { ...values, pos: draft };
    for (const x of layer.texts) if (!v[x.id]?.trim()) v[x.id] = x.placeholder || x.label;
    return v;
  }, [values, draft, layer.texts]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const artUrl = shown.art ? art.find((a) => a.id === shown.art)?.url : undefined;
      const [pic, artImg] = await Promise.all([
        picture ? loadImage(picture.url).catch(() => null) : Promise.resolve(null),
        artUrl ? loadImage(artUrl, true).catch(() => null) : Promise.resolve(null),
        ensureFonts(layer.texts.map((x) => x.font)),
      ]);
      const el = canvas.current;
      if (cancelled || !el) return;
      // No picture yet: a soft plain background, so the words show.
      let source: { width: number; height: number } | null = pic;
      if (!source) {
        const plain = makeCanvas(600, 600);
        const pc = plain.ctx as unknown as CanvasRenderingContext2D;
        const g = pc.createLinearGradient(0, 0, 600, 600);
        g.addColorStop(0, "#8a6a52");
        g.addColorStop(1, "#2f3d55");
        pc.fillStyle = g;
        pc.fillRect(0, 0, 600, 600);
        source = plain.canvas as unknown as { width: number; height: number };
      }
      const nat = pic ? { w: pic.naturalWidth, h: pic.naturalHeight } : { w: source.width, h: source.height };
      let crop: Rect = { x: 0, y: 0, w: nat.w, h: nat.h };
      if (pic && picture?.crop) {
        const kx = picture.size ? nat.w / picture.size.width : 1;
        const ky = picture.size ? nat.h / picture.size.height : 1;
        crop = { x: picture.crop.x * kx, y: picture.crop.y * ky, w: picture.crop.w * kx, h: picture.crop.h * ky };
      }
      const flat = flatPicture({
        picture: source,
        crop,
        placement: pic && picture?.crop ? placement : "cover",
        backgroundColour: background,
        targetAspect: aspect,
        makeCanvas,
        flatMax: 900,
        template,
        layer: { layer, values: shown, art: new Map(artImg && shown.art ? [[shown.art, artImg]] : []), family: cssFamily },
      });
      el.width = flat.w;
      el.height = flat.h;
      el.getContext("2d")!.drawImage(flat.canvas as HTMLCanvasElement, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shown, picture, art, layer, template, placement, background, aspect]);

  /** Sets an item's position, kept to what's drawn (inside the print area, within the size limits). */
  const set = (id: LayerPosId, p: LayerPos) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const placed = placeBox(it.box, p);
    setDraft((d) => ({ ...d, [id]: { cx: placed.box.x + placed.box.w / 2, cy: placed.box.y + placed.box.h / 2, rotate: placed.rotate, scale: placed.scale } }));
  };

  const drag = useRef<{ id: LayerPosId; x: number; y: number; from: LayerPos } | null>(null);
  const frac = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const f = frac(e);
    set(d.id, { ...d.from, cx: d.from.cx + f.x - d.x, cy: d.from.cy + f.y - d.y });
  };
  const end = () => (drag.current = null);

  if (!item) return null;
  const p = posOf(item, draft);
  const placed = placeBox(item.box, p);
  const moved = Boolean(draft[item.id]);
  // The biggest it can be: the size limit, or as wide (or tall) as the print area.
  const maxScale = Math.min(LAYER_SCALE.max, 1 / item.box.w, 1 / item.box.h);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={`${uid}-d`}
          data-testid="store-reposition"
          className="ph-no-capture fixed inset-x-0 bottom-0 z-50 flex max-h-[96dvh] flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-white px-4 pb-5 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] focus:outline-none lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[22px] lg:p-6"
          data-ph-mask
        >
          <span className="mx-auto h-[5px] w-10 flex-none rounded-full bg-[#D9D5CA] lg:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="font-serif text-[26px] font-normal leading-[1.1] text-[#1a1a1a]">{t("store.repositionTitle")}</Dialog.Title>
              <Dialog.Description id={`${uid}-d`} className="text-[13px] leading-[1.45] text-[#4d4d4d]">
                {t("store.repositionSub")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t("store.close")} className="-mr-2 -mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-[10px] hover:bg-black/5">
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {items.length > 1 && (
            <div role="radiogroup" aria-label={t("store.repositionWhich")} className="flex flex-wrap gap-2">
              {items.map((i) => (
                <label key={i.id} className={cn("flex h-10 cursor-pointer items-center rounded-full px-3.5 text-[14px] focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-2", i.id === item.id ? "border-2 border-[#DD07C4] bg-pink-tint font-extrabold text-[#8E047B]" : "border-[1.5px] border-[#D9D5CA] font-bold text-[#2b2b2b]")}>
                  <input type="radio" className="sr-only" name={`${uid}-item`} checked={i.id === item.id} onChange={() => setCurrent(i.id)} />
                  {i.label}
                </label>
              ))}
            </div>
          )}

          <div
            ref={stage}
            className="relative mx-auto touch-none select-none overflow-hidden rounded-[12px] bg-black/[0.04]"
            style={{ aspectRatio: `${aspect}`, width: `min(100%, calc(50dvh * ${aspect}))` }}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
            data-testid="store-reposition-stage"
          >
            <canvas ref={canvas} role="img" aria-label={t("store.repositionPrint")} className="absolute inset-0 h-full w-full" />
            <div
              className="absolute border-2 border-dashed border-[#DD07C4] bg-[#DD07C4]/10"
              style={{ left: `${placed.box.x * 100}%`, top: `${placed.box.y * 100}%`, width: `${placed.box.w * 100}%`, height: `${placed.box.h * 100}%`, transform: placed.rotate ? `rotate(${placed.rotate}deg)` : undefined, transformOrigin: "center" }}
            >
              <button
                type="button"
                aria-label={t("store.repositionMove", { label: item.label })}
                data-testid="store-reposition-handle"
                className="absolute inset-0 cursor-move focus:outline-none focus-visible:ring-4 focus-visible:ring-[#DD07C4]/40"
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  drag.current = { id: item.id, ...frac(e), from: p };
                }}
                onPointerMove={onMove}
                onPointerUp={end}
                onKeyDown={(e) => {
                  const s = e.shiftKey ? 0.05 : 0.01;
                  const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
                  if (!d) return;
                  e.preventDefault();
                  set(item.id, { ...p, cx: p.cx + d[0], cy: p.cy + d[1] });
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[14px] font-extrabold text-[#1a1a1a]">
              <span className="flex justify-between">
                {t("store.repositionTurn")}
                <span className="font-semibold text-[#6b6b6b]">{Math.round(placed.rotate)}°</span>
              </span>
              <input type="range" min={-180} max={180} step={1} value={Math.round(placed.rotate)} onChange={(e) => set(item.id, { ...p, rotate: Number(e.target.value) })} className="h-8 accent-[#B8059F]" data-testid="store-reposition-turn" />
            </label>
            <label className="flex flex-col gap-1 text-[14px] font-extrabold text-[#1a1a1a]">
              <span className="flex justify-between">
                {t("store.repositionSize")}
                <span className="font-semibold text-[#6b6b6b]">{Math.round(placed.scale * 100)}%</span>
              </span>
              <input type="range" min={LAYER_SCALE.min * 100} max={Math.floor(maxScale * 100)} step={5} value={Math.round(placed.scale * 100)} onChange={(e) => set(item.id, { ...p, scale: Number(e.target.value) / 100 })} className="h-8 accent-[#B8059F]" data-testid="store-reposition-size" />
            </label>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={!moved}
              onClick={() =>
                setDraft((d) => {
                  const next = { ...d };
                  delete next[item.id];
                  return next;
                })
              }
              className="flex h-12 items-center gap-1.5 rounded-[12px] px-3 text-[15px] font-extrabold text-[#8E047B] disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("store.repositionReset")}
            </button>
            <span className="flex-1" />
            <Dialog.Close asChild>
              <button type="button" className="h-12 rounded-[12px] border-[1.5px] border-[#1f1f1f] bg-white px-4 text-[15px] font-extrabold text-[#1f1f1f]">
                {t("store.repositionCancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              data-testid="store-reposition-done"
              onClick={() => {
                onSave(draft);
                trackClient("store_reposition_saved", { product_id: productId, items: Object.keys(draft).length });
                onClose();
              }}
              className="bg-primary-gradient shadow-primary h-12 rounded-[12px] px-5 text-[15px] font-extrabold text-white"
            >
              {t("store.repositionDone")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
