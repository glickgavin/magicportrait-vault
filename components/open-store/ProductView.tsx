"use client";

import { storeFetch } from "./store-fetch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, Clock, Gift, Heart, Info, Loader2, Lock, Minus, Plus, Star, Truck, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProductPageData, RelatedCard, VariantView } from "@/lib/open-store/pages";
import { fillStep, optionGroups, variantFor } from "@/lib/open-store/view";
import type { DescriptionBlock } from "@/lib/shop/description";
import { defaultCrop, fitVariant } from "@/lib/shop/fit";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";
import { ShopPreview } from "@/components/shop/ShopPreview";
import { checkLayerValues, layerActive, type LayerTextId, type LayerValues } from "@/lib/shop/layer";
import { Personalise } from "./Personalise";
import { ProductCard } from "./ProductCard";
import { Stars } from "./Stars";
import { STORE_CART_EVENT, type StoreCartEvent } from "./StoreCart";
import { fileUrl, usePicture, type PictureView, type SlotPhoto } from "./use-picture";

const ICONS = { truck: Truck, heart: Heart, lock: Lock, gift: Gift, star: Star, clock: Clock } as const;

function Blocks({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-[1.55] text-[#4d4d4d]">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Reads a chosen file's size in the browser; null when it isn't a picture the browser can read. */
async function readImage(file: File): Promise<{ url: string; width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  const ok = await new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!ok) URL.revokeObjectURL(url);
  return ok ? { url, ...ok } : null;
}

/** The crop that puts a picture in a print shape: all of it for "contain", else the largest top-kept window. */
function cropFor(w: number, h: number, aspect: number, placement: VariantView["placement"]) {
  return placement === "contain" ? { x: 0, y: 0, w, h } : defaultCrop(w, h, Math.round(aspect * 10000), 10000);
}

const REFUSED: Record<string, (minPx: number, mb: number) => string> = {
  too_small: (px) => t("store.photoTooSmall", { px }),
  too_large: (_px, mb) => t("store.photoFormats", { mb }),
  unsupported: () => t("store.photoHeic"),
  not_an_image: () => t("store.photoNotImage"),
  empty: () => t("store.photoNotImage"),
};

export type EarlierPhoto = { fileId: string; width: number; height: number };

export function ProductView({
  data,
  initialVariantId,
  minPhotoPx,
  maxMb,
  uploadMaxPx,
  from,
  initialPicture,
  earlierPhotos,
  askEmail = true,
}: {
  data: ProductPageData;
  initialVariantId: string | null;
  minPhotoPx: number;
  maxMb: number;
  uploadMaxPx: number;
  from: string;
  initialPicture: PictureView | null;
  earlierPhotos: EarlierPhoto[];
  askEmail?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const groups = useMemo(() => optionGroups(data.variants), [data.variants]);
  const [variantId, setVariantId] = useState<string>(initialVariantId ?? data.variants.find((v) => v.available)?.id ?? data.variants[0]?.id);
  const variant: VariantView | undefined = data.variants.find((v) => v.id === variantId) ?? data.variants[0];
  const [shown, setShown] = useState(0);
  const [photos, setPhotos] = useState<(SlotPhoto | null)[]>(() =>
    data.slots.map((_, i) => {
      const id = initialPicture?.photos[i];
      const known = id ? earlierPhotos.find((p) => p.fileId === id) : null;
      return id ? { fileId: id, url: fileUrl(id), width: known?.width ?? 0, height: known?.height ?? 0 } : null;
    }),
  );
  const [names, setNames] = useState<string[]>(() => data.slots.map(() => ""));
  const [photoError, setPhotoError] = useState<{ slot: number; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [emailDone, setEmailDone] = useState(false);
  const [emailClosed, setEmailClosed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("mmp_store_email_ask_closed") === "1";
    } catch {
      return false;
    }
  });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const relatedRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const started = useRef<number | null>(null);
  const slowSent = useRef(false);
  const pid = data.product.legacyId;
  const themeName = data.theme?.name ?? null;

  const { state, create, choose: pickResult, reset } = usePicture({
    productId: pid,
    uploadMaxPx,
    initial: initialPicture,
    onEvent: (e) => {
      if (e === "started") {
        started.current = Date.now();
        slowSent.current = false;
      }
      if (e === "ready" || e === "failed") {
        started.current = null;
        setShown(0);
      }
      // The steps and then the picture show in the picture area, above the button on phones.
      if (e === "started" || e === "ready") stageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
  });
  const picture = state.phase === "ready" ? state.picture : null;
  const result = picture ? (picture.images[picture.chosen] ?? picture.images[0]) : null;

  // The personalisation layer (docs/open-store.md › Personalise): drawn on the preview as they type, a moment later.
  const layer = layerActive(data.template?.layer) ? data.template.layer : null;
  const [layerVals, setLayerVals] = useState<LayerValues>(() => ({ art: layer?.art?.required ? (layer.art.choices[0] ?? null) : null }));
  const [drawVals, setDrawVals] = useState<LayerValues>(layerVals);
  const [layerError, setLayerError] = useState<{ field: LayerTextId | "art"; text: string } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setDrawVals(layerVals), 250);
    return () => window.clearTimeout(id);
  }, [layerVals]);
  const creating = state.phase === "creating";
  const petName = names[0]?.trim() || null;

  useEffect(() => {
    trackClient("page_view_store_product", { product_id: pid, theme_slug: data.theme?.slug ?? null, has_picture: Boolean(initialPicture), from });
  }, [pid, data.theme?.slug, from, initialPicture]);

  // "Still painting…" once per picture; leaving the page while painting.
  useEffect(() => {
    if (state.phase === "creating" && state.slow && !slowSent.current) {
      slowSent.current = true;
      trackClient("store_generation_slow", { product_id: pid, seconds: started.current ? Math.round((Date.now() - started.current) / 1000) : null });
    }
  }, [state, pid]);
  useEffect(() => {
    const left = () => {
      if (started.current) trackClient("store_generation_left", { product_id: pid, seconds: Math.round((Date.now() - started.current) / 1000) });
    };
    window.addEventListener("pagehide", left);
    return () => window.removeEventListener("pagehide", left);
  }, [pid]);

  // Related products: the first 3, or with a picture, the first 3 the picture suits.
  const related: RelatedCard[] = useMemo(() => {
    if (!result) return data.related.slice(0, 3);
    return data.related.filter((r) => r.draw && fitVariant({ kind: "portrait", width: result.width, height: result.height }, r.draw.rules).ok).slice(0, 3);
  }, [data.related, result]);

  // "On more gifts" in view (once).
  const withPicture = Boolean(result);
  useEffect(() => {
    const el = relatedRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        trackClient("store_related_shown", { product_id: pid, count: related.length, with_picture: withPicture });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pid, related.length, withPicture]);

  // Object URLs for chosen photos are freed when the page goes.
  useEffect(() => () => photos.forEach((p) => p && "file" in p && URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = Object.fromEntries((variant?.options ?? []).map((o) => [o.name, o.value]));
  const pickOption = (name: string, value: string) => {
    const next = variantFor(data.variants, { ...chosen, [name]: value });
    if (!next) return;
    setVariantId(next.id);
    const q = new URLSearchParams(window.location.search);
    q.set("variant", next.legacyId);
    router.replace(`?${q.toString()}`, { scroll: false });
    trackClient("store_variant_selected", { product_id: pid, option: name, value, has_picture: withPicture });
  };

  /** A new photo needs a new picture; the old one stays saved and comes back on return. */
  const photoChanged = () => {
    if (state.phase !== "idle" && state.phase !== "creating") reset();
  };

  async function choose(slot: number, file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    const fail = (reason: string, text: string) => {
      setPhotoError({ slot, text });
      trackClient("store_photo_chosen", { product_id: pid, ok: false, reason, slot: slot + 1, reused: false });
    };
    if (file.size > maxMb * 1024 * 1024) return fail("too_large", t("store.photoFormats", { mb: maxMb }));
    const img = await readImage(file);
    // HEIC often can't be read by the browser; the server converts it, so it's accepted here.
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!img && !heic) return fail("not_an_image", t("store.photoNotImage"));
    if (img && Math.min(img.width, img.height) < minPhotoPx) {
      URL.revokeObjectURL(img.url);
      return fail("too_small", t("store.photoTooSmall", { px: minPhotoPx }));
    }
    setPhotos((list) => {
      const next = [...list];
      const old = next[slot];
      if (old && "file" in old) URL.revokeObjectURL(old.url);
      next[slot] = { file, url: img?.url ?? "", width: img?.width ?? 0, height: img?.height ?? 0 };
      return next;
    });
    photoChanged();
    trackClient("store_photo_chosen", { product_id: pid, ok: true, reason: null, slot: slot + 1, reused: false });
  }

  function reuse(slot: number, p: EarlierPhoto) {
    setPhotoError(null);
    setPhotos((list) => list.map((x, i) => (i === slot ? { fileId: p.fileId, url: fileUrl(p.fileId), width: p.width, height: p.height } : x)));
    photoChanged();
    trackClient("store_photo_chosen", { product_id: pid, ok: true, reason: null, slot: slot + 1, reused: true });
  }

  function tryAgain() {
    trackClient("store_try_again_tapped", { product_id: pid, after: state.phase === "ready" ? "ready" : "failed" });
    reset();
    setPhotos(data.slots.map(() => null));
    setShown(0);
    setTimeout(() => document.getElementById(`${uid}-slot-0`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
  }

  // A photo refused by the server shows under its slot.
  useEffect(() => {
    if (state.phase === "refused") setPhotoError({ slot: state.slot, text: (REFUSED[state.reason] ?? REFUSED.not_an_image)(minPhotoPx, maxMb) });
  }, [state, minPhotoPx, maxMb]);

  const filled = photos.every(Boolean);
  const steps = data.stepTemplates.map((s) => fillStep(s, petName, data.product.title));
  const price = variant ? variant.price : null;
  const was = variant?.was ?? null;
  const save = price && was ? Number(was) - Number(price) : 0;

  // Gallery: before a picture, the product's media (the first is its sample). After: their picture drawn on the
  // product, then the picture on its own, then the other media marked "Example".
  type Slide = { kind: "drawn" } | { kind: "alone" } | { kind: "media"; url: string; alt: string; example: boolean };
  const canDraw = Boolean(result && data.template && variant?.aspect);
  const slides: Slide[] = result
    ? [...(canDraw ? [{ kind: "drawn" as const }] : []), { kind: "alone" as const }, ...data.gallery.slice(1).map((g) => ({ kind: "media" as const, url: g.url, alt: g.alt, example: true }))]
    : data.gallery.map((g, i) => ({ kind: "media" as const, url: g.url, alt: g.alt, example: i > 0 }));
  const slide = slides[Math.min(shown, slides.length - 1)];
  const theirPhoto = photos[0]?.url || null;

  const accordion = (key: string, title: string, body: React.ReactNode, className?: string) => (
    <div className={cn("border-b border-[#EDEAE2]", className)}>
      <h3>
        <button
          type="button"
          aria-expanded={open === key}
          aria-controls={`${uid}-${key}`}
          onClick={() => {
            const now = open === key ? null : key;
            setOpen(now);
            if (now) trackClient("store_info_opened", { product_id: pid, section: key });
          }}
          className="flex h-[58px] w-full items-center justify-between px-4 text-left text-[15px] font-extrabold text-[#1a1a1a] lg:px-0"
        >
          {title}
          {open === key ? <Minus className="h-[18px] w-[18px]" aria-hidden="true" /> : <Plus className="h-[18px] w-[18px]" aria-hidden="true" />}
        </button>
      </h3>
      {open === key && (
        <div id={`${uid}-${key}`} className="px-4 pb-5 lg:px-0">
          {body}
        </div>
      )}
    </div>
  );

  const mainPicture = () => {
    if (slide?.kind === "drawn" && result && data.template && variant?.aspect)
      return (
        <ShopPreview
          template={data.template}
          pictureUrl={fileUrl(result.file)}
          crop={cropFor(result.width, result.height, variant.aspect, variant.placement)}
          pictureSize={{ width: result.width, height: result.height }}
          placement={variant.placement}
          aspect={variant.aspect}
          background={variant.background}
          width={640}
          layer={layer ? { values: drawVals, art: data.layerArt } : null}
          alt={t("store.yourPictureOn", { product: data.product.title })}
          className="rounded-none lg:rounded-[16px]"
        />
      );
    if (slide?.kind === "alone" && result) return <img src={fileUrl(result.file)} alt={t("store.yourPicture")} data-testid="store-picture" className="block aspect-square w-full bg-page object-contain lg:rounded-[16px]" />;
    if (slide?.kind === "media") return <img src={slide.url} alt={slide.alt} className="block aspect-square w-full bg-page object-cover object-top lg:rounded-[16px]" />;
    return <span className="block aspect-square w-full bg-page lg:rounded-[16px]" aria-hidden="true" />;
  };

  return (
    <div className="mx-auto max-w-[1280px] lg:px-10">
      {data.breadcrumb && (
        <nav aria-label={t("store.breadcrumb")} className="flex gap-1.5 px-4 py-2.5 text-[13px] text-[#6b6b6b] lg:px-0 lg:py-4">
          <Link href={data.breadcrumb.href} className="hover:underline">
            {data.breadcrumb.title}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[#2b2b2b]">{themeName ?? data.product.title}</span>
        </nav>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[52px] lg:pb-12">
        <section ref={stageRef} aria-label={t("store.pictures")} className="scroll-mt-[72px] flex flex-col gap-2.5 lg:sticky lg:top-[88px] lg:flex-row-reverse lg:gap-4">
          <div className="ph-no-capture relative lg:flex-1" data-ph-mask data-testid="store-stage">
            <div className={cn("transition-opacity", creating && "opacity-40")}>{mainPicture()}</div>
            {!result && !creating && shown === 0 && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.sample")}</span>}
            {slide?.kind === "media" && slide.example && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.example")}</span>}
            {!creating && data.pricing.pct != null && <span className="absolute right-3 top-3 rounded-full bg-[#B8059F] px-2.5 py-[5px] text-[12px] font-extrabold tracking-[0.06em] text-white">{t("store.off", { pct: Math.round(data.pricing.pct * 100) })}</span>}
            {result && theirPhoto && slide?.kind !== "media" && <img src={theirPhoto} alt={t("store.yourPhoto")} className="absolute bottom-3 left-3 h-14 w-14 rounded-full border-[3px] border-white object-cover shadow-md" />}
            {creating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6" role="status" aria-live="polite" data-testid="store-creating">
                <span className="relative flex h-[112px] w-[112px] items-center justify-center">
                  <span className="absolute inset-0 animate-spin rounded-full border-4 border-[#F6D3EF] border-t-[#DD07C4]" aria-hidden="true" />
                  {theirPhoto ? <img src={theirPhoto} alt="" className="h-[92px] w-[92px] rounded-full object-cover" /> : <span className="h-[92px] w-[92px] rounded-full bg-pink-tint" aria-hidden="true" />}
                </span>
                <ol className="flex w-full max-w-[300px] flex-col gap-2 rounded-[14px] bg-white/[0.94] p-3.5 text-[14px] shadow-sm">
                  {steps.map((s, i) => {
                    const done = state.step > i;
                    const now = state.step === i;
                    return (
                      <li key={i} className={cn("flex items-center gap-2.5", done ? "text-[#2b2b2b]" : now ? "font-extrabold text-[#1a1a1a]" : "text-[#8a8a8a]")} aria-current={now ? "step" : undefined}>
                        {done ? <Check className="h-4 w-4 text-[#1f8a4c]" aria-hidden="true" /> : now ? <Loader2 className="h-4 w-4 animate-spin text-[#B8059F]" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border-2 border-[#D9D5CA]" aria-hidden="true" />}
                        {s}
                      </li>
                    );
                  })}
                </ol>
                {state.slow && <p className="max-w-[300px] rounded-[12px] bg-white/[0.94] px-3 py-2 text-center text-[14px] font-bold text-[#8E047B]">{t("store.slow")}</p>}
              </div>
            )}
          </div>
          {creating && askEmail && state.id && !emailDone && !emailClosed && <EmailAsk generationId={state.id} productId={pid} name={petName} onDone={() => setEmailDone(true)} onClose={() => setEmailClosed(true)} />}
          {creating && emailDone && (
            <p role="status" className="mx-4 rounded-[14px] bg-pink-tint px-4 py-3 text-[14px] font-bold text-[#8E047B] lg:mx-0">
              {t("store.emailWillSend")}
            </p>
          )}
          {!creating && slides.length > 1 && (
            <div className="flex gap-2 px-4 lg:flex-col lg:px-0">
              {slides.map((g, i) => (
                <button key={i} type="button" aria-label={t("store.pictureN", { n: i + 1, count: slides.length })} aria-current={i === shown ? "true" : undefined} onClick={() => setShown(i)} className={cn("ph-no-capture h-16 w-16 flex-none overflow-hidden rounded-[10px] bg-page lg:h-[72px] lg:w-[72px]", i === shown ? "border-2 border-[#DD07C4]" : "border border-[#E7E3D8]")}>
                  <img src={g.kind === "media" ? g.url : fileUrl(result!.file)} alt="" className={cn("block h-full w-full object-top", g.kind === "alone" ? "object-contain" : "object-cover")} />
                </button>
              ))}
            </div>
          )}
          {picture && picture.images.length > 1 && (
            <fieldset className="px-4 lg:hidden" data-testid="store-results">
              <legend className="pb-2 text-[14px] font-extrabold">{t("store.pickFavourite")}</legend>
              <ResultStrip picture={picture} max={data.imagesToShow} onPick={(n) => pickAndTrack(n)} />
            </fieldset>
          )}
        </section>

        <div>
          {picture && (
            <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-[14px] bg-pink-tint px-4 py-3 lg:mx-0 lg:mt-0 lg:mb-4" role="status" data-testid="store-ready">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold text-[#8E047B]">{petName ? t("store.readyNamed", { name: petName }) : t("store.ready")}</span>
                {(picture.emailAsked || emailDone) && <span className="text-[13px] text-[#8E047B]">{t("store.emailedToo")}</span>}
              </span>
              <button type="button" onClick={tryAgain} className="h-10 flex-none rounded-[10px] border-[1.5px] border-[#8E047B] bg-white px-3 text-[14px] font-extrabold text-[#8E047B]">
                {t("store.tryAnother")}
              </button>
            </div>
          )}
          {picture && picture.images.length > 1 && (
            <fieldset className="mx-0 mb-4 hidden lg:block" data-testid="store-results-desktop">
              <legend className="pb-2 text-[14px] font-extrabold">{t("store.pickFavourite")}</legend>
              <ResultStrip picture={picture} max={data.imagesToShow} onPick={(n) => pickAndTrack(n)} />
            </fieldset>
          )}
          <section className="flex flex-col gap-2 px-4 pt-5 lg:px-0 lg:pt-0">
            <h1 className="font-serif text-[30px] font-normal leading-[1.12] text-[#1a1a1a] lg:text-[40px]">{themeName ? `${data.product.title} · ${themeName}` : data.product.title}</h1>
            {data.product.rating != null && data.product.ratingCount != null && (
              <span className="flex items-center gap-1.5 text-[13px] text-[#6b6b6b]">
                <Stars rating={data.product.rating} />
                {tn("store.reviews", data.product.ratingCount)}
              </span>
            )}
            {price && (
              <span className="flex flex-wrap items-baseline gap-2.5 pt-0.5" data-testid="store-price">
                <span className="text-[24px] font-extrabold text-[#1a1a1a]">{formatMoney(price, data.pricing.currency)}</span>
                {was && (
                  <span className="text-[16px] text-[#6b6b6b] line-through">
                    <span className="sr-only">{t("store.wasPrice", { price: "" })}</span>
                    {formatMoney(was, data.pricing.currency)}
                  </span>
                )}
                {save > 0 && <span className="text-[13px] font-extrabold text-[#8E047B]">{t("store.youSave", { amount: formatMoney(save, data.pricing.currency) })}</span>}
                {data.pricing.pct != null && <span className="rounded-full bg-pink-tint px-2.5 py-1 text-[12px] font-bold text-pink-dark">{t("store.priceApplied", { label: data.pricing.label })}</span>}
              </span>
            )}
            {data.bullets.length > 0 && (
              <div className="mt-1">
                <Blocks blocks={data.bullets} />
              </div>
            )}
            {variant?.delivery && (
              <p className="flex items-center gap-2 text-[14px] text-[#2b2b2b]" data-testid="store-delivery">
                <Truck className="h-4 w-4" aria-hidden="true" />
                {t("store.delivery", { window: variant.delivery })}
              </p>
            )}
          </section>

          {groups.map((g) => {
            const value = chosen[g.name];
            return (
              <fieldset key={g.name} className="mx-4 mt-[22px] flex flex-col gap-2.5 lg:mx-0">
                <legend className="pb-2.5 text-[15px] font-extrabold text-[#1a1a1a]">
                  {t("store.variantLabel", { option: g.name })}
                  <span className="font-medium">{value}</span>
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {g.values.map((val) => {
                    const v = variantFor(data.variants, { ...chosen, [g.name]: val });
                    const on = val === value;
                    const dis = !v || !v.available;
                    return (
                      <label key={val} className={cn("relative flex h-[52px] cursor-pointer items-center justify-center rounded-[12px] px-1 text-center text-[14px] focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-2", on ? "border-2 border-[#DD07C4] bg-pink-tint font-extrabold text-[#8E047B]" : "border-[1.5px] border-[#D9D5CA] font-bold text-[#2b2b2b]", dis && "cursor-not-allowed opacity-50 line-through")}>
                        <input type="radio" name={`${uid}-${g.name}`} value={val} checked={on} disabled={dis} onChange={() => pickOption(g.name, val)} className="absolute h-px w-px opacity-0" />
                        {val}
                        {dis && <span className="sr-only"> ({t("store.soldOut")})</span>}
                        {v?.badge && !dis && <span className="absolute -top-[9px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white no-underline">{v.badge}</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {!picture &&
            data.slots.map((slot, i) => {
              const p = photos[i];
              const earlier = earlierPhotos.filter((e) => !photos.some((x) => x && "fileId" in x && x.fileId === e.fileId));
              return (
                <section key={i} className="mx-4 mt-6 flex flex-col gap-2.5 lg:mx-0" aria-labelledby={`${uid}-slot-${i}`}>
                  <span id={`${uid}-slot-${i}`} className="text-[15px] font-extrabold text-[#1a1a1a]">
                    {slot.label}
                  </span>
                  <input
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    id={`${uid}-file-${i}`}
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                    className="sr-only"
                    disabled={creating}
                    aria-label={p ? `${t("store.change")}: ${slot.label}` : `${t("store.choosePhoto")}: ${slot.label}`}
                    onChange={(e) => {
                      void choose(i, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {p ? (
                    <div className="ph-no-capture flex items-center gap-3 rounded-[14px] border border-[#E7E3D8] p-2.5" data-testid="photo-added" data-ph-mask>
                      {p.url ? <img src={p.url} alt={t("store.yourPhoto")} className="h-14 w-14 flex-none rounded-[10px] object-cover" /> : <span className="h-14 w-14 flex-none rounded-[10px] bg-page" aria-hidden="true" />}
                      <span className="min-w-0 flex-1 text-[14px] font-extrabold">{t("store.photoAdded")}</span>
                      <button type="button" disabled={creating} onClick={() => inputs.current[i]?.click()} className="h-10 rounded-[10px] border-[1.5px] border-[#1f1f1f] px-3.5 text-[14px] font-extrabold disabled:opacity-50">
                        {t("store.change")}
                      </button>
                    </div>
                  ) : (
                    <label htmlFor={`${uid}-file-${i}`} className="relative flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-[#D9A6CF] bg-[#FFF8FD] px-[18px] py-6 text-center focus-within:ring-2 focus-within:ring-[#DD07C4]">
                      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-pink-tint">
                        <Camera className="h-[26px] w-[26px] text-[#B8059F]" aria-hidden="true" />
                      </span>
                      <span className="text-[16px] font-extrabold text-[#1a1a1a]">{t("store.choosePhoto")}</span>
                      <span className="text-[13px] leading-[1.45] text-[#616161]">{t("store.photoFormats", { mb: maxMb })}</span>
                    </label>
                  )}
                  {!p && earlier.length > 0 && (
                    <div className="flex flex-col gap-2" data-testid="earlier-photos">
                      <span className="text-[13px] font-bold text-[#4d4d4d]">{t("store.usePhotoBefore")}</span>
                      <div className="ph-no-capture flex gap-2" data-ph-mask>
                        {earlier.slice(0, 6).map((e, n) => (
                          <button key={e.fileId} type="button" onClick={() => reuse(i, e)} aria-label={t("store.earlierPhotoN", { n: n + 1 })} className="h-14 w-14 flex-none overflow-hidden rounded-[10px] border border-[#E7E3D8]">
                            <img src={fileUrl(e.fileId)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {photoError?.slot === i && (
                    <p role="alert" className="text-[14px] font-bold text-[#a1251b]">
                      {photoError.text}
                    </p>
                  )}
                  {i === 0 && data.photoTips && (
                    <div className="flex items-start gap-2.5 px-0.5 pt-0.5">
                      <Info className="mt-px h-[18px] w-[18px] flex-none text-[#8E047B]" aria-hidden="true" />
                      <span className="text-[13px] leading-[1.5] text-[#4d4d4d]">{data.photoTips}</span>
                    </div>
                  )}
                  {slot.nameLabel && (
                    <div className="mt-2 flex flex-col gap-2">
                      <label htmlFor={`${uid}-name-${i}`} className="text-[15px] font-extrabold text-[#1a1a1a]">
                        {slot.nameLabel}
                      </label>
                      <input
                        id={`${uid}-name-${i}`}
                        type="text"
                        value={names[i]}
                        maxLength={data.nameMax}
                        autoComplete="off"
                        disabled={creating}
                        placeholder={slot.namePlaceholder ? `e.g. ${slot.namePlaceholder}` : undefined}
                        onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                        className="ph-no-capture h-[52px] rounded-[12px] border-[1.5px] border-[#D9D5CA] bg-white px-3.5 text-[16px] text-[#1a1a1a]"
                      />
                      <span className="self-end text-[12px] text-[#6b6b6b]" aria-live="polite">
                        {t("store.nameCount", { count: names[i].length, max: data.nameMax })}
                      </span>
                    </div>
                  )}
                </section>
              );
            })}
          {layer && (
            <Personalise
              layer={layer}
              art={data.layerArt}
              values={layerVals}
              error={layerError}
              note={picture ? null : t("store.personaliseLater")}
              onChange={(v) => {
                setLayerVals(v);
                setLayerError(null);
                // Show their picture on the product, where the words go.
                if (canDraw) setShown(0);
              }}
            />
          )}

          {!picture && (
            <p className="mx-4 mt-3 text-[12px] leading-[1.5] text-[#616161] lg:mx-0">
              {t("store.consent")}{" "}
              <a href="https://magicportraits.ai/policies/privacy-policy" className="underline" target="_blank" rel="noreferrer">
                {t("store.privacy")}
              </a>
            </p>
          )}

          <section className="mx-4 mt-3.5 flex flex-col gap-2.5 lg:mx-0">
            {picture ? (
              <div className="flex gap-2.5">
                <div className="flex h-14 flex-none items-center rounded-[12px] border-[1.5px] border-[#D9D5CA]" role="group" aria-label={t("store.quantity")}>
                  <button type="button" aria-label={t("store.less")} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-full w-11 items-center justify-center disabled:opacity-40">
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center text-[16px] font-extrabold" aria-live="polite">
                    {qty}
                  </span>
                  <button type="button" aria-label={t("store.moreQty")} disabled={qty >= 10} onClick={() => setQty((q) => Math.min(10, q + 1))} className="flex h-full w-11 items-center justify-center disabled:opacity-40">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <button type="button" data-testid="store-add" disabled={adding || !variant?.available} onClick={() => void addToCart()} className="bg-primary-gradient shadow-primary flex h-14 flex-1 items-center justify-center gap-2 rounded-[12px] text-[17px] font-extrabold text-white disabled:opacity-60">
                  {adding && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                  {adding ? t("store.adding") : price ? t("store.addToCartPrice", { price: formatMoney(Number(price) * qty, data.pricing.currency) }) : t("store.addToCart")}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!filled || creating}
                  data-testid="store-create"
                  onClick={() => {
                    setPhotoError(null);
                    void create(photos as SlotPhoto[], names);
                  }}
                  className="bg-primary-gradient shadow-primary flex h-14 items-center justify-center gap-2 rounded-[12px] text-[17px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#E7E3D8] disabled:text-[#6b6b6b] disabled:shadow-none"
                >
                  {creating && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                  {creating ? t("store.creating") : t("store.create")}
                </button>
                <span className="text-center text-[13px] text-[#616161]">{t("store.createNote")}</span>
              </>
            )}
            {picture && <p className="text-center text-[12px] text-[#616161]">{t("store.payments")}</p>}
            {state.phase === "failed" && (
              <div role="alert" className="flex flex-col items-start gap-2.5 rounded-[14px] bg-[#FDECEA] p-3.5 text-[14px] font-bold text-[#a1251b]" data-testid="store-failed">
                {t("store.failed")}
                <button type="button" onClick={tryAgain} className="h-10 rounded-[10px] border-[1.5px] border-[#a1251b] bg-white px-3 font-extrabold">
                  {t("store.tryAnother")}
                </button>
              </div>
            )}
            {state.phase === "limited" && (
              <p role="alert" className="rounded-[14px] bg-page p-3.5 text-[14px] font-bold text-[#2b2b2b]" data-testid="store-limited">
                {state.count != null ? tn("store.limited", state.count) : t("store.limitedIp")}
              </p>
            )}
            {state.phase === "busy" && (
              <p role="alert" className="rounded-[14px] bg-page p-3.5 text-[14px] font-bold text-[#2b2b2b]">
                {t("store.busy")}
              </p>
            )}
            {note && (
              <p role="status" className="text-center text-[14px] font-bold text-[#8E047B]">
                {note}
              </p>
            )}
          </section>

          <section aria-label={t("store.shoppingInfo")} className="mx-4 mt-6 flex flex-col gap-3.5 rounded-[16px] bg-page p-4 lg:mx-0">
            {data.reassurance.map((r, i) => {
              const Icon = ICONS[r.icon] ?? Truck;
              return (
                <div key={i} className="flex items-center gap-3">
                  <Icon className="h-[22px] w-[22px] flex-none" aria-hidden="true" strokeWidth={1.8} />
                  <span className="text-[14px] leading-[1.4]">
                    {r.text}
                    {r.icon === "truck" && variant?.delivery ? ` · ${t("store.arrives", { window: variant.delivery })}` : ""}
                  </span>
                </div>
              );
            })}
          </section>

          <section aria-label={t("store.more", { product: data.product.title })} className="mt-[22px] border-t border-[#EDEAE2] lg:mt-6">
            {accordion("details", t("store.details"), <Blocks blocks={data.details} />)}
            {accordion(
              "how",
              t("store.howItWorks"),
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[1.55] text-[#4d4d4d]">
                {data.howItWorks.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>,
              "lg:hidden",
            )}
            {data.shipping.length > 0 && accordion("shipping", t("store.shippingReturns"), <Blocks blocks={data.shipping} />)}
          </section>
        </div>
      </div>

      {/* Desktop: How it works as a band. */}
      <ol className="hidden bg-page lg:-mx-10 lg:grid lg:grid-cols-3 lg:gap-8 lg:px-10 lg:py-10">
        {data.howItWorks.map((s, i) => (
          <li key={i} className="flex items-start gap-3.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#8E047B]">{i + 1}</span>
            <span className="pt-1.5 text-[15px] leading-[1.5]">{s}</span>
          </li>
        ))}
      </ol>

      {related.length > 0 && (
        <section
          ref={relatedRef}
          aria-labelledby={`${uid}-related`}
          className="flex flex-col gap-3.5 px-4 pb-[30px] pt-7 lg:px-0 lg:pt-12"
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            const n = a ? related.findIndex((r) => a.getAttribute("href")?.startsWith(r.href)) : -1;
            if (n >= 0) trackClient("store_related_tapped", { from_product_id: pid, to_product_id: related[n].legacyId, position: n + 1, with_picture: withPicture });
          }}
        >
          <h2 id={`${uid}-related`} className="font-serif text-[24px] font-normal leading-[1.15] text-[#1a1a1a] lg:text-[32px]">
            {result ? (petName ? t("store.onMoreGiftsNamed", { name: petName }) : t("store.onMoreGifts")) : t("store.alsoMade")}
          </h2>
          <div className="grid grid-cols-3 gap-2.5 lg:gap-6" data-testid="store-related">
            {result && picture
              ? related.map((r) => <RelatedWithPicture key={r.id} card={r} picture={picture} result={result} currency={data.pricing.currency} />)
              : related.map((r, i) => <ProductCard key={r.id} card={r} currency={data.pricing.currency} position={i + 1} collection="related" small from="related" />)}
          </div>
        </section>
      )}
    </div>
  );

  async function addToCart() {
    if (!picture || !variant) return;
    let layerBody: LayerValues | undefined;
    if (layer) {
      const c = checkLayerValues(layer, layerVals);
      if (!c.ok) {
        const label = c.field === "art" ? (layer.art?.label ?? "") : (layer.texts.find((x) => x.id === c.field)?.label ?? "");
        setLayerError({ field: c.field, text: c.error.endsWith("please fill this in.") ? t("store.layerFill", { label }) : c.error.endsWith("please choose one.") ? t("store.layerChoose", { label }) : c.error });
        return;
      }
      layerBody = c.values;
    }
    setAdding(true);
    setNote(null);
    const r = await storeFetch("/api/store/cart/lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: picture.id, variantId: variant.id, quantity: qty, from: from === "related" ? "related" : "product", ...(layerBody ? { layer: layerBody } : {}) }) }).catch(() => null);
    setAdding(false);
    if (!r?.ok) {
      const b = (await r?.json().catch(() => null)) as { error?: string; message?: string } | null;
      setNote(b?.error === "layer_invalid" && b.message ? b.message : t("store.addError"));
      return;
    }
    if (layer && layerBody) trackClient("store_layer_filled", { product_id: pid, has_text1: Boolean(layerBody.t1), has_text2: Boolean(layerBody.t2), has_art: Boolean(layerBody.art) });
    const body = (await r.json()) as { cart: StoreCartEvent["cart"] };
    window.dispatchEvent(new CustomEvent<StoreCartEvent>(STORE_CART_EVENT, { detail: { cart: body.cart, open: true } }));
  }

  function pickAndTrack(n: number) {
    if (!picture) return;
    void pickResult(picture, n);
    trackClient("store_result_picked", { product_id: pid, index: n + 1, of: Math.min(picture.images.length, data.imagesToShow) });
  }
}

function ResultStrip({ picture, max, onPick }: { picture: PictureView; max: number; onPick: (n: number) => void }) {
  return (
    <div className="ph-no-capture flex gap-2" data-ph-mask role="radiogroup">
      {picture.images.slice(0, max).map((img, n) => (
        <button key={img.file} type="button" role="radio" aria-checked={picture.chosen === n} aria-label={t("store.resultN", { n: n + 1 })} onClick={() => onPick(n)} className={cn("h-[72px] w-[72px] flex-none overflow-hidden rounded-[10px] bg-page", picture.chosen === n ? "border-[3px] border-[#DD07C4]" : "border border-[#E7E3D8]")}>
          <img src={fileUrl(img.file)} alt="" className="h-full w-full object-cover object-top" />
        </button>
      ))}
    </div>
  );
}

/** A product under "On more gifts", drawn with their picture; opens that product with the same picture. */
function RelatedWithPicture({ card, picture, result, currency }: { card: RelatedCard; picture: PictureView; result: PictureView["images"][number]; currency: string }) {
  const d = card.draw!;
  return (
    <Link href={`${card.href}?from=related&g=${picture.id}`} className="group flex flex-col gap-1" data-testid="store-related-card">
      <ShopPreview template={d.template} pictureUrl={fileUrl(result.file)} crop={cropFor(result.width, result.height, d.aspect, d.placement)} pictureSize={{ width: result.width, height: result.height }} placement={d.placement} aspect={d.aspect} background={d.background} width={220} alt={t("store.yourPictureOn", { product: card.title })} className="rounded-[10px]" />
      <span data-testid="store-card-title" className="pt-1 text-[13px] font-extrabold leading-[1.3] group-hover:underline">
        {card.title}
      </span>
      <span className="text-[13px] text-[#2b2b2b]">{card.many ? t("store.from", { price: formatMoney(card.price, currency) }) : formatMoney(card.price, currency)}</span>
      <span className="text-[13px] font-extrabold text-[#8E047B]">{t("store.seeIt")}</span>
    </Link>
  );
}

/** "While we paint: want Teddy's picture by email?" Optional; never blocks or delays the picture. */
function EmailAsk({ generationId, productId, name, onDone, onClose }: { generationId: string; productId: string; name: string | null; onDone: () => void; onClose: () => void }) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    trackClient("store_email_ask_shown", { product_id: productId });
  }, [productId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const r = await storeFetch("/api/store/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId, email, consent }) }).catch(() => null);
    setSending(false);
    if (r?.ok || r?.status === 409) onDone();
    else setError(r?.status === 400 ? t("store.emailInvalid") : t("store.cartError"));
  }
  return (
    <form onSubmit={submit} className="ph-no-capture relative mx-4 flex flex-col gap-2.5 rounded-[16px] border border-[#F0C9E8] bg-[#FFF8FD] p-4 lg:mx-0" data-ph-mask data-testid="store-email-ask" aria-labelledby={`${uid}-t`}>
      <button
        type="button"
        aria-label={t("store.close")}
        onClick={() => {
          try {
            window.localStorage.setItem("mmp_store_email_ask_closed", "1");
          } catch {
            /* a private window: it just shows again next time */
          }
          trackClient("store_email_ask_closed", { product_id: productId });
          onClose();
        }}
        className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-[10px] hover:bg-black/5"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <span id={`${uid}-t`} className="pr-9 text-[15px] font-extrabold text-[#1a1a1a]">
        {name ? t("store.emailAskNamed", { name }) : t("store.emailAsk")}
      </span>
      <span className="text-[13px] leading-[1.45] text-[#4d4d4d]">{t("store.emailAskSub")}</span>
      <label htmlFor={`${uid}-e`} className="sr-only">
        {t("store.emailLabel")}
      </label>
      <input id={`${uid}-e`} type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("store.emailPlaceholder")} className="h-12 rounded-[12px] border-[1.5px] border-[#D9D5CA] bg-white px-3.5 text-[16px]" />
      <label className="flex items-start gap-2.5 text-[13px] leading-[1.45] text-[#4d4d4d]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[#B8059F]" />
        {t("store.emailConsent")}
      </label>
      {error && (
        <p role="alert" className="text-[13px] font-bold text-[#a1251b]">
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className="h-12 rounded-[12px] bg-[#1a1a1a] text-[15px] font-extrabold text-white disabled:opacity-60">
        {t("store.emailSend")}
      </button>
    </form>
  );
}
