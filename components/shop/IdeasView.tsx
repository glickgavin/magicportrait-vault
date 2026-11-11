"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import type { IdeaView, Pricing, ShopPage, VariantView } from "@/lib/shop/pages";
import { centredCrop, type Rect } from "@/lib/shop/fit";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";
import { Price } from "./Price";
import { announceCartCount } from "./CartIcon";
import { ShopPreview } from "./ShopPreview";

type Picture = { id: string; kind: string; url: string | null; width: number | null; height: number | null; ordered: boolean };

export function IdeasView({ page, picture, top, rest, others, pricing, sizeKnown, tooSmall = null, open, maxQty }: { page: ShopPage; picture: Picture; top: IdeaView[]; rest: IdeaView[]; others: { id: string; url: string | null }[]; pricing: Pricing; sizeKnown: boolean; tooSmall?: { px: number; need: number } | null; open: string | null; maxQty: number }) {
  const [showAll, setShowAll] = useState(false);
  const [openIdea, setOpenIdea] = useState<IdeaView | null>(() => [...top, ...rest].find((i) => i.handle === open) ?? null);
  const [showChange, setShowChange] = useState(false);
  const base = `/${page}`;
  const all = useMemo(() => [...top, ...rest], [top, rest]);
  useEffect(() => {
    trackClient("page_view_shop_ideas", { page, products_shown: top.length, products_total: all.length, image_kind: picture.kind });
  }, [page, top.length, all.length, picture.kind]);

  const openSheet = (i: IdeaView) => {
    trackClient("shop_product_opened", { product_handle: i.handle, position: i.position, page });
    setOpenIdea(i);
  };
  const card = (i: IdeaView) => {
    const v = i.variants[0];
    return (
      <li key={i.handle}>
        <button type="button" onClick={() => openSheet(i)} className="flex h-full w-full flex-col gap-2 rounded-[20px] bg-white p-2.5 text-left text-ink shadow-[0_1px_4px_rgba(0,0,0,0.04)] focus:outline-none focus-visible:ring-4 focus-visible:ring-magenta/40">
          {picture.url && <ShopPreview template={i.template} pictureUrl={picture.url} crop={v.crop} placement={v.placement} aspect={v.aspect} background={v.background} width={260} pictureSize={picture.width && picture.height ? { width: picture.width, height: picture.height } : null} alt={t("shop.previewAlt", { product: i.title })} />}
          <span className="px-1 text-[15px] font-bold leading-5">{i.title}</span>
          <Price price={i.from} discounted={i.fromDiscounted} currency={pricing.currency} from={i.variants.length > 1} className="px-1 pb-1" />
        </button>
      </li>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
      <Link href={base} className="-ml-2 flex h-11 w-fit items-center gap-1 px-2 text-[15px] font-bold text-ink">
        ‹ {t(page === "gifts" ? "shop.gifts" : "shop.products")}
      </Link>
      <div className="flex flex-wrap items-start gap-6">
        <aside aria-labelledby="pic-title" className="flex w-full flex-col gap-3 rounded-[20px] bg-white p-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)] lg:sticky lg:top-20 lg:w-[320px]">
          <div className="flex items-center gap-3 lg:flex-col lg:items-stretch">
            {picture.url && <img src={picture.url} alt={t("shop.yourPicture")} className="ph-no-capture h-20 w-20 flex-none rounded-[12px] object-cover lg:h-auto lg:w-full lg:rounded-[16px]" referrerPolicy="no-referrer" />}
            <div className="min-w-0 flex-1">
              <h2 id="pic-title" className="text-[16px] font-extrabold">
                {t("shop.yourPicture")}
              </h2>
              <button type="button" aria-expanded={showChange} onClick={() => setShowChange((x) => !x)} className="mt-1 text-[14px] font-bold text-pink-link">
                {t("shop.changePicture")}
              </button>
            </div>
          </div>
          {(showChange || others.length <= 6) && (
            <ul aria-label={t("shop.changePicture")} className={cn("grid grid-cols-5 gap-1.5", !showChange && "hidden lg:grid")}>
              {others.map((o, n) => (
                <li key={o.id}>
                  <Link href={`${base}/i/${o.id}`} aria-label={t("shop.usePicture", { n: n + 1 })} onClick={() => trackClient("shop_image_selected", { changed: true, page })} className="block aspect-square overflow-hidden rounded-[10px] bg-black/5">
                    {o.url && <img src={o.url} alt="" className="ph-no-capture h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`${base}/choose`} className="flex aspect-square items-center justify-center rounded-[10px] bg-black/5 text-[12px] font-bold text-ink">
                  {t("shop.all")}
                </Link>
              </li>
            </ul>
          )}
        </aside>

        <section aria-labelledby="ideas-title" className="flex min-w-0 flex-[999_1_420px] flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 id="ideas-title" className="text-[24px] font-extrabold leading-8 lg:text-[30px]">
                {tn("shop.ideasCount", top.length)}
              </h1>
              <p className="text-[14px] text-ink-2">{t("shop.ideasSub")}</p>
            </div>
            {pricing.pct != null && <span className="rounded-full bg-pink-tint px-2.5 py-1 text-[12px] font-bold text-pink-dark">{t("shop.priceApplied", { label: pricing.label })}</span>}
          </div>
          {!sizeKnown && <p role="alert" className="rounded-[14px] bg-[#fff1d6] p-3 text-[14px] text-[#7a4a00]">{t("shop.sizeUnknown")}</p>}
          {sizeKnown && !all.length && (
            <p className="rounded-[14px] bg-white p-4 text-[15px] text-ink-2" data-testid="no-ideas">
              {tooSmall ? t("shop.noIdeasSmall", { px: tooSmall.px, need: tooSmall.need }) : t("shop.noIdeas")}
            </p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">{top.map(card)}</ul>
          {rest.length > 0 &&
            (showAll ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">{rest.map(card)}</ul>
            ) : (
              <button type="button" onClick={() => setShowAll(true)} className="h-12 rounded-[12px] border-2 border-dashed border-[#B8059F]/30 text-[15px] font-extrabold text-ink">
                {t("shop.seeAll", { count: rest.length })}
              </button>
            ))}
          <p className="text-[13px] text-ink-2">{t("shop.shipsNote")}</p>
        </section>
      </div>
      {openIdea && picture.url && picture.width && picture.height && (
        <ProductSheet key={openIdea.handle} page={page} idea={openIdea} picture={{ ...picture, url: picture.url, width: picture.width, height: picture.height }} pricing={pricing} maxQty={maxQty} onClose={() => setOpenIdea(null)} />
      )}
    </div>
  );
}

function ProductSheet({ page, idea, picture, pricing, maxQty, onClose }: { page: ShopPage; idea: IdeaView; picture: Picture & { url: string; width: number; height: number }; pricing: Pricing; maxQty: number; onClose: () => void }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(idea.variants[0].id);
  const v = idea.variants.find((x) => x.id === variantId) ?? idea.variants[0];
  const [crop, setCrop] = useState<Rect>(v.crop);
  const [qty, setQty] = useState(1);
  const [adjusting, setAdjusting] = useState(false);
  const [state, setState] = useState<{ busy: boolean; added: boolean; error: string | null }>({ busy: false, added: false, error: null });
  const multi = idea.variants.length > 1;
  const pick = (id: string) => {
    setVariantId(id);
    setCrop(idea.variants.find((x) => x.id === id)!.crop);
    setState((s) => ({ ...s, added: false, error: null }));
  };

  async function add() {
    setState({ busy: true, added: false, error: null });
    const r = await fetch("/api/shop/cart/lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, imageId: picture.id, variantId: v.id, quantity: qty, crop: JSON.stringify(crop) === JSON.stringify(v.crop) ? undefined : crop }) });
    if (r.ok) {
      setState({ busy: false, added: true, error: null });
      // The header's cart updates in place; the page itself doesn't need reading again.
      const b = (await r.json().catch(() => ({}))) as { count?: number };
      if (typeof b.count === "number") announceCartCount(b.count);
      else router.refresh();
    } else setState({ busy: false, added: false, error: t("shop.checkoutErrors.other") });
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-y-auto rounded-t-[24px] bg-white pb-6 shadow-xl outline-none lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[920px] lg:max-w-[calc(100vw-48px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[24px]"
          aria-describedby={undefined}
          // Focus the sheet itself when it opens, not the close button (whose focus ring looked like a stray pink box).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <div aria-hidden="true" className="mx-auto mt-2.5 h-[5px] w-10 rounded-full bg-black/15 lg:hidden" />
          <Dialog.Close asChild>
            <button type="button" aria-label={t("shop.close")} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-[12px]">
              <X className="h-5 w-5 text-ink/70" aria-hidden="true" />
            </button>
          </Dialog.Close>
          <div className="grid gap-5 px-4 pt-7 lg:grid-cols-[1fr_380px] lg:p-8">
            <div className="flex flex-col gap-2">
              <div className="relative">
                <ShopPreview template={idea.template} pictureUrl={picture.url} crop={crop} placement={v.placement} aspect={v.aspect} background={v.background} width={520} pictureSize={{ width: picture.width, height: picture.height }} alt={t("shop.previewAlt", { product: idea.title })} />
                {v.adjustable && v.placement !== "contain" && (
                  <button type="button" onClick={() => setAdjusting(true)} className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[14px] font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
                    <Crop className="h-4 w-4" aria-hidden="true" /> {t("shop.adjust")}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Dialog.Title className="text-[22px] font-extrabold leading-7 lg:text-[28px]">{idea.title}</Dialog.Title>
                <Price price={v.price} discounted={v.discounted} currency={pricing.currency} size="lg" />
                {idea.description.length > 0 && (
                  <div className="mt-1 flex flex-col gap-2.5 text-[14px] leading-[22px] text-ink-2" data-testid="product-description">
                    {idea.description.map((b, i) =>
                      b.kind === "p" ? (
                        <p key={i}>{b.text}</p>
                      ) : (
                        <ul key={i} className="flex flex-col gap-1.5">
                          {b.items.map((item, j) => (
                            <li key={j} className="flex gap-2.5">
                              <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-pink-link/70" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      ),
                    )}
                  </div>
                )}
              </div>
              {multi && (
                <fieldset>
                  <legend className="mb-2 text-[14px] font-bold">{t("shop.size")}</legend>
                  <div role="radiogroup" aria-label={t("shop.size")} className="grid grid-cols-3 gap-2">
                    {idea.variants.map((x) => {
                      const on = x.id === v.id;
                      return (
                        <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => pick(x.id)} className={cn("flex h-14 flex-col items-center justify-center rounded-[12px] px-1 text-center", on ? "border-2 border-magenta bg-pink-tint text-pink-dark" : "border border-black/15 bg-white text-ink")}>
                          <span className={cn("text-[14px] leading-4", on ? "font-extrabold" : "font-bold")}>{x.title}</span>
                          <span className="text-[12px] opacity-75">{formatMoney(x.discounted ?? x.price, pricing.currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <div className="flex items-center justify-between">
                <span id="qty-label" className="text-[14px] font-bold">
                  {t("shop.quantity")}
                </span>
                <div role="group" aria-labelledby="qty-label" className="flex items-center overflow-hidden rounded-[12px] border border-black/15">
                  <button type="button" aria-label={t("shop.fewer")} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 text-[20px] disabled:opacity-40">
                    −
                  </button>
                  <span aria-live="polite" className="w-9 text-center text-[16px] font-bold">
                    {qty}
                  </span>
                  <button type="button" aria-label={t("shop.moreOne")} disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="h-11 w-11 text-[20px] disabled:opacity-40">
                    +
                  </button>
                </div>
              </div>
              {state.added ? (
                <div role="status" className="flex flex-col gap-2 rounded-[14px] bg-[#e3f4e8] p-3">
                  <p className="text-[15px] font-bold text-[#1f6b35]">{t("shop.added")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/cart" className="bg-primary-gradient shadow-primary flex h-11 items-center justify-center rounded-[12px] text-[15px] font-extrabold text-white">
                      {t("shop.viewCart")}
                    </Link>
                    <button type="button" onClick={onClose} className="h-11 rounded-[12px] border border-black/15 bg-white text-[15px] font-bold">
                      {t("shop.keepShopping")}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={state.busy} onClick={() => void add()} className="bg-primary-gradient shadow-primary h-13 rounded-[12px] py-3.5 text-[16px] font-extrabold text-white disabled:opacity-60">
                  {state.busy ? t("shop.adding") : `${t("shop.addToCart")} · ${formatMoney(Number(v.discounted ?? v.price) * qty, pricing.currency)}`}
                </button>
              )}
              {state.error && (
                <p role="alert" className="text-[14px] text-[#a1251b]">
                  {state.error}
                </p>
              )}
              <p className="text-[13px] text-ink-2">{t("shop.shipsNote")}</p>
            </div>
          </div>
          {adjusting && <AdjustDialog picture={picture} variant={v} crop={crop} onDone={(c) => { setCrop(c); setAdjusting(false); }} onCancel={() => setAdjusting(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Adjust: zoom and move the picture inside the print shape, never past the size's smallest-picture rule. */
function AdjustDialog({ picture, variant, crop, onDone, onCancel }: { picture: Picture & { url: string; width: number; height: number }; variant: VariantView; crop: Rect; onDone: (c: Rect) => void; onCancel: () => void }) {
  const base = useMemo(() => centredCrop(picture.width, picture.height, variant.aspect, 1), [picture.width, picture.height, variant.aspect]);
  const maxZoom = Math.max(1, Math.min(3, Math.min(base.w, base.h) / Math.max(1, variant.minShortSidePx)));
  const [zoom, setZoom] = useState(() => Math.min(maxZoom, Math.max(1, base.w / crop.w)));
  const [c, setC] = useState<Rect>(crop);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const FW = 300;
  const scale = FW / c.w;

  const clampRect = (r: Rect): Rect => ({ ...r, x: Math.round(Math.min(Math.max(0, r.x), picture.width - r.w)), y: Math.round(Math.min(Math.max(0, r.y), picture.height - r.h)) });
  function setZoomKeepCentre(z: number) {
    setZoom(z);
    setC((prev) => {
      const w = Math.round(base.w / z);
      const h = Math.round(w / variant.aspect);
      return clampRect({ x: prev.x + (prev.w - w) / 2, y: prev.y + (prev.h - h) / 2, w, h });
    });
  }
  const nudge = (dx: number, dy: number) => setC((prev) => clampRect({ ...prev, x: prev.x + dx, y: prev.y + dy }));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content className="fixed inset-0 z-[60] flex flex-col bg-white lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[24px]" aria-describedby="adjust-help">
          <div className="flex h-14 items-center justify-between border-b border-line px-2">
            <button type="button" onClick={onCancel} className="h-11 px-3 text-[15px] font-bold">
              {t("shop.cancel")}
            </button>
            <Dialog.Title className="text-[16px] font-extrabold">{t("shop.adjustTitle")}</Dialog.Title>
            <button type="button" onClick={() => onDone(c)} className="h-11 px-3 text-[15px] font-extrabold text-pink-link">
              {t("shop.useCrop")}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center bg-[#2b2926] py-8">
            <div
              ref={frame}
              tabIndex={0}
              role="group"
              aria-label={t("shop.adjustHelp")}
              onKeyDown={(e) => {
                const step = Math.round(c.w * (e.shiftKey ? 0.05 : 0.01));
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (d) {
                  e.preventDefault();
                  nudge(d[0], d[1]);
                }
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const d = drag.current;
                setC((prev) => clampRect({ ...prev, x: d.cx - (e.clientX - d.x) / scale, y: d.cy - (e.clientY - d.y) / scale }));
              }}
              onPointerUp={() => (drag.current = null)}
              className="relative cursor-grab touch-none overflow-hidden rounded-[4px] outline-none ring-2 ring-white focus-visible:ring-4 focus-visible:ring-magenta"
              style={{ width: FW, height: FW / variant.aspect }}
            >
              <img
                src={picture.url}
                alt=""
                draggable={false}
                className="ph-no-capture pointer-events-none absolute max-w-none select-none"
                style={{ width: picture.width * scale, height: picture.height * scale, left: -c.x * scale, top: -c.y * scale }}
                referrerPolicy="no-referrer"
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-[2px] border-[1.5px] border-dashed border-white/80" />
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <p role="status" className="text-[14px] font-bold text-[#1f6b35]">
              {t("shop.qualityGreat")}
            </p>
            <label className="flex flex-col gap-1 text-[14px] font-bold">
              {t("shop.zoom")}
              <input type="range" min={1} max={maxZoom} step={0.01} value={zoom} disabled={maxZoom <= 1} onChange={(e) => setZoomKeepCentre(Number(e.target.value))} className="accent-[#DD07C4]" />
            </label>
            <p id="adjust-help" className="text-[13px] text-ink-2">
              {t("shop.adjustHelp")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setZoom(1); setC(variant.crop); }} className="h-11 rounded-[12px] border border-black/15 text-[14px] font-bold">
                {t("shop.reset")}
              </button>
              <button type="button" onClick={() => onDone(c)} className="bg-primary-gradient shadow-primary h-11 rounded-[12px] text-[15px] font-extrabold text-white">
                {t("shop.useCrop")}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
