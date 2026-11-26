"use client";

import { storeFetch } from "./store-fetch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Check, ChevronDown, Clock, Gift, Heart, Info, Loader2, Lock, Minus, MoveHorizontal, Plus, Star, Truck, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProductPageData, RelatedCard, VariantView } from "@/lib/open-store/pages";
import { chipColumns, chipImageUrl, chipPictures, fillStep, optionGroups, variantFor } from "@/lib/open-store/view";
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

const PHOTO_TYPES = "image/jpeg,image/png,image/heic,image/heif,image/webp";

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
  moreGiftsStep = 4,
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
  /** "On more gifts": how many show at first and per "See more gifts" (open_store.more_gifts_step). */
  moreGiftsStep?: number;
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
  const [names, setNames] = useState<string[]>(() => data.slots.map((_, i) => initialPicture?.names?.[i] ?? ""));
  // Their photo stays in one place (docs/open-store.md › Product page, item 6). Changing the photo or the name of a
  // ready picture keeps that picture on show (and one tap away) until they create a new one.
  const [kept, setKept] = useState<{ picture: PictureView; photos: (SlotPhoto | null)[]; names: string[] } | null>(null);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);
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
  const relatedRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  // While the picture is made: on phones the progress shows where they added their photo, not up in the gallery.
  const progressRef = useRef<HTMLDivElement | null>(null);
  const wide = useIsWide();
  const wideRef = useRef(wide);
  useEffect(() => {
    wideRef.current = wide;
  }, [wide]);
  const started = useRef<number | null>(null);
  const slowSent = useRef(false);
  const pid = data.product.legacyId;

  const { state, create, choose: pickResult, reset, restore } = usePicture({
    productId: pid,
    uploadMaxPx,
    initial: initialPicture,
    onEvent: (e, made) => {
      if (e === "started") {
        started.current = Date.now();
        slowSent.current = false;
      }
      if (e === "ready" || e === "failed") {
        started.current = null;
        setShown(0);
      }
      if (e === "ready") {
        setKept(null);
        // The photos are saved now: hold them by their ids, so making another picture never uploads them twice.
        if (made)
          setPhotos((list) =>
            list.map((x, i) => {
              const id = made.photos[i];
              if (!x || !id || "fileId" in x) return x;
              URL.revokeObjectURL(x.url);
              return { fileId: id, url: fileUrl(id), width: x.width, height: x.height };
            }),
          );
      }
      // Phones: the steps show around their photo (scrolled into view); then the finished picture in the gallery.
      // Desktop: the gallery stays beside the form, so both show there.
      if (e === "started") (wideRef.current ? stageRef.current : progressRef.current)?.scrollIntoView({ block: wideRef.current ? "start" : "center", behavior: "smooth" });
      if (e === "ready") stageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
  });
  const picture = state.phase === "ready" ? state.picture : null;
  // What the gallery shows: the ready picture, or the one they had while a new photo or name waits to be made.
  const onShow = picture ?? kept?.picture ?? null;
  const result = onShow ? (onShow.images[onShow.chosen] ?? onShow.images[0]) : null;

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

  // "On more gifts": every candidate (with a picture, the ones it suits), shown a step at a time.
  const allRelated: RelatedCard[] = useMemo(() => {
    if (!result) return data.related;
    return data.related.filter((r) => r.draw && fitVariant({ kind: "portrait", width: result.width, height: result.height }, r.draw.rules).ok);
  }, [data.related, result]);
  const step = Math.max(1, moreGiftsStep);
  const [giftCount, setGiftCount] = useState(step);
  const related = allRelated.slice(0, giftCount);
  const firstNewGift = useRef<number | null>(null);
  const giftGrid = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // After "See more gifts", the first new card takes the focus.
    const n = firstNewGift.current;
    if (n == null) return;
    firstNewGift.current = null;
    giftGrid.current?.querySelectorAll<HTMLAnchorElement>("a")[n]?.focus();
  }, [giftCount]);
  const seeMoreGifts = () => {
    const next = Math.min(allRelated.length, giftCount + step);
    firstNewGift.current = giftCount;
    setGiftCount(next);
    trackClient("store_more_gifts_shown", { product_id: pid, shown: next, has_picture: Boolean(result) });
  };

  // "On more gifts" in view (once).
  const withPicture = Boolean(result);
  const relatedCount = related.length;
  useEffect(() => {
    const el = relatedRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        trackClient("store_related_shown", { product_id: pid, count: relatedCount, with_picture: withPicture });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pid, relatedCount > 0, withPicture]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /**
   * A new photo (or name) needs a new picture. The ready one stays saved, stays on show until they create the new
   * one, and "Keep Teddy's picture" puts it back.
   */
  const photoChanged = () => {
    if (state.phase === "ready") {
      const had = state.picture;
      setKept({
        picture: had,
        photos: photos.map((x, i) => {
          const id = had.photos[i];
          return id ? { fileId: id, url: fileUrl(id), width: x?.width ?? 0, height: x?.height ?? 0 } : x;
        }),
        names,
      });
    }
    if (state.phase !== "idle" && state.phase !== "creating") reset();
  };

  function keepPicture() {
    if (!kept) return;
    photos.forEach((x, i) => {
      if (x && "file" in x && x !== kept.photos[i]) URL.revokeObjectURL(x.url);
    });
    setPhotos(kept.photos);
    setNames(kept.names);
    setPhotoError(null);
    restore(kept.picture);
    setKept(null);
    trackClient("store_picture_kept", { product_id: pid });
  }

  /** "Change photo" (and "Choose another photo" after a failure) open one sheet: upload, or a photo added before. */
  function openSheet(slot: number) {
    trackClient("store_try_again_tapped", { product_id: pid, after: picture ? "ready" : state.phase === "failed" ? "failed" : "photo" });
    setSheetSlot(slot);
  }

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

  function nameChanged(slot: number, value: string) {
    if (value !== names[slot]) photoChanged();
    setNames((n) => n.map((x, j) => (j === slot ? value : x)));
  }

  // Photos for the sheet: this visit's saved photos, then the ones added before, each once, newest first.
  const savedPhotos: EarlierPhoto[] = useMemo(() => {
    const seen = new Set<string>();
    const out: EarlierPhoto[] = [];
    const add = (p: EarlierPhoto) => {
      if (seen.has(p.fileId)) return;
      seen.add(p.fileId);
      out.push(p);
    };
    for (const pic of [picture, kept?.picture]) pic?.photos.forEach((id) => add({ fileId: id, width: 0, height: 0 }));
    kept?.photos.forEach((p) => p && "fileId" in p && add({ fileId: p.fileId, width: p.width, height: p.height }));
    photos.forEach((p) => p && "fileId" in p && add({ fileId: p.fileId, width: p.width, height: p.height }));
    earlierPhotos.forEach(add);
    return out;
  }, [picture, kept, photos, earlierPhotos]);

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

  // The name on one line: the type gets smaller until it fits (down to 18 px), then the end is cut with "…".
  const titleRef = useFitText<HTMLHeadingElement>(data.product.title, 18);

  // Phones: the pictures in a row to swipe through, with dots under them (no thumbnails). Desktop keeps the thumbnails.
  const railRef = useRef<HTMLDivElement | null>(null);
  const [swiped, setSwiped] = useState(false);
  const slideCount = slides.length;
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    if (Math.round(rail.scrollLeft / rail.clientWidth) === shown) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left: shown * rail.clientWidth, behavior: still ? "auto" : "smooth" });
  }, [shown, slideCount]);
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    const i = Math.max(0, Math.min(slideCount - 1, Math.round(rail.scrollLeft / rail.clientWidth)));
    if (rail.scrollLeft > 4) setSwiped(true);
    if (i !== shown) setShown(i);
  };
  const theirPhoto = photos[0]?.url || null;
  // The small circle on the picture is the photo it was made from.
  const madeFrom = (kept ? kept.photos[0]?.url : theirPhoto) || null;

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

  // The email offer while we paint, under the progress (one place at a time).
  const emailBits = (
    <>
      {askEmail && state.phase === "creating" && state.id && !emailDone && !emailClosed && <EmailAsk generationId={state.id} productId={pid} name={petName} onDone={() => setEmailDone(true)} onClose={() => setEmailClosed(true)} />}
      {emailDone && (
        <p role="status" className="mx-4 rounded-[14px] bg-pink-tint px-4 py-3 text-[14px] font-bold text-[#8E047B] lg:mx-0">
          {t("store.emailWillSend")}
        </p>
      )}
    </>
  );

  const renderSlide = (slide: Slide | undefined) => {
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
          <span className="min-w-0 truncate text-[#2b2b2b]">{data.product.title}</span>
        </nav>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[52px] lg:pb-12">
        <section ref={stageRef} aria-label={t("store.pictures")} className="scroll-mt-[72px] flex flex-col gap-2.5 lg:sticky lg:top-[88px] lg:flex-row-reverse lg:gap-4">
          <div className="ph-no-capture relative lg:flex-1" data-ph-mask data-testid="store-stage">
            <div className={cn("transition-opacity", creating && "opacity-40")}>
              {wide || slides.length < 2 ? (
                renderSlide(slide)
              ) : (
                <div ref={railRef} onScroll={onRailScroll} tabIndex={0} aria-label={t("store.swipeLabel")} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DD07C4] [&::-webkit-scrollbar]:hidden" data-testid="store-rail">
                  {slides.map((s, i) => (
                    <div key={i} className="w-full flex-none snap-center snap-always" aria-hidden={i !== shown ? true : undefined}>
                      {renderSlide(s)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!wide && !swiped && !creating && slides.length > 1 && (
              <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-bold text-white" aria-hidden="true">
                <MoveHorizontal className="h-3.5 w-3.5" />
                {t("store.swipe")}
              </span>
            )}
            {!result && !creating && shown === 0 && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.sample")}</span>}
            {slide?.kind === "media" && slide.example && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.example")}</span>}
            {!creating && data.pricing.pct != null && <span className="absolute right-3 top-3 rounded-full bg-[#B8059F] px-2.5 py-[5px] text-[12px] font-extrabold tracking-[0.06em] text-white">{t("store.off", { pct: Math.round(data.pricing.pct * 100) })}</span>}
            {result && madeFrom && slide?.kind !== "media" && <img src={madeFrom} alt={t("store.yourPhoto")} className="absolute bottom-3 left-3 h-14 w-14 rounded-full border-[3px] border-white object-cover shadow-md" />}
            {creating && wide && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
                <Progress photo={theirPhoto} steps={steps} step={state.step} slow={state.slow} />
              </div>
            )}
          </div>
          {creating && wide && emailBits}
          {!creating && slides.length > 1 && (
            <div className="flex items-center justify-center lg:hidden" data-testid="store-dots">
              {slides.map((_, i) => (
                <button key={i} type="button" aria-label={t("store.pictureN", { n: i + 1, count: slides.length })} aria-current={i === shown ? "true" : undefined} onClick={() => setShown(i)} className="flex h-6 w-6 items-center justify-center">
                  <span className={cn("block h-2 rounded-full transition-all", i === shown ? "w-5 bg-[#DD07C4]" : "w-2 bg-[#CFC9BC]")} />
                </button>
              ))}
            </div>
          )}
          {!creating && slides.length > 1 && (
            <div className="hidden gap-2 lg:flex lg:flex-col">
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
          {picture && picture.images.length > 1 && (
            <fieldset className="mx-0 mb-4 hidden lg:block" data-testid="store-results-desktop">
              <legend className="pb-2 text-[14px] font-extrabold">{t("store.pickFavourite")}</legend>
              <ResultStrip picture={picture} max={data.imagesToShow} onPick={(n) => pickAndTrack(n)} />
            </fieldset>
          )}
          <section className="flex flex-col gap-2 px-4 pt-5 lg:px-0 lg:pt-0">
            <h1 ref={titleRef} className="truncate font-serif text-[26px] font-normal leading-[1.15] text-[#1a1a1a] lg:text-[36px]" title={data.product.title}>
              {data.product.title}
            </h1>
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
            const pics = chipPictures(g.name, g.values, data.variants, chosen, data.optionSwatches, data.pictureOptions);
            return (
              <fieldset key={g.name} className="mx-4 mt-[22px] flex flex-col gap-2.5 lg:mx-0">
                <legend className="pb-2.5 text-[15px] font-extrabold text-[#1a1a1a]">
                  {t("store.variantLabel", { option: g.name })}
                  <span className="font-medium">{value}</span>
                </legend>
                <div className={cn("grid gap-2", chipColumns(g.values.length) === 4 ? "grid-cols-4" : "grid-cols-3")} data-testid="store-option-chips">
                  {g.values.map((val) => {
                    const v = variantFor(data.variants, { ...chosen, [g.name]: val });
                    const on = val === value;
                    const dis = !v || !v.available;
                    const pic = pics?.get(val) ?? null;
                    return (
                      <label key={val} className={cn("relative flex cursor-pointer items-center justify-center rounded-[12px] px-1 text-center text-[14px] leading-tight focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-2", pic ? "min-h-[52px] flex-col gap-1.5 py-2 text-[13px]" : "h-[52px]", on ? "border-2 border-[#DD07C4] bg-pink-tint font-extrabold text-[#8E047B]" : "border-[1.5px] border-[#D9D5CA] font-bold text-[#2b2b2b]", dis && "cursor-not-allowed opacity-50 line-through")}>
                        <input type="radio" name={`${uid}-${g.name}`} value={val} checked={on} disabled={dis} onChange={() => pickOption(g.name, val)} className="absolute h-px w-px opacity-0" />
                        {pic && (
                          <span className="block h-11 w-11 flex-none overflow-hidden rounded-[8px] border border-black/10 bg-page" style={pic.color && !pic.image ? { background: pic.color } : undefined} aria-hidden="true" data-testid="store-chip-picture">
                            {pic.image && <img src={chipImageUrl(pic.image)} alt="" className="h-full w-full object-cover" loading="lazy" />}
                          </span>
                        )}
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

          {data.slots.map((slot, i) => {
            const p = photos[i];
            const earlier = earlierPhotos.filter((e) => !photos.some((x) => x && "fileId" in x && x.fileId === e.fileId));
            const thumb = (cls: string) => (p?.url ? <img src={p.url} alt={t("store.yourPhoto")} className={cn("object-cover", cls)} /> : <span className={cn("block bg-page", cls)} aria-hidden="true" />);
            const change = (
              <button type="button" disabled={creating} onClick={() => openSheet(i)} className="h-10 flex-none whitespace-nowrap rounded-[10px] border-[1.5px] border-[#1f1f1f] bg-white px-3.5 text-[14px] font-extrabold text-[#1f1f1f] disabled:opacity-50">
                {t("store.changePhoto")}
              </button>
            );
            return (
              // Their photo, in the same place in every state: choose one, then the photo, the progress (phones) or "ready".
              <section key={i} className="mx-4 mt-6 flex flex-col gap-2.5 lg:mx-0" aria-labelledby={`${uid}-slot-${i}`}>
                <h2 id={`${uid}-slot-${i}`} className="text-[15px] font-extrabold text-[#1a1a1a]">
                  {slot.label}
                </h2>
                {!p && (
                  <input
                    id={`${uid}-file-${i}`}
                    type="file"
                    accept={PHOTO_TYPES}
                    className="sr-only"
                    disabled={creating}
                    aria-label={`${t("store.choosePhoto")}: ${slot.label}`}
                    onChange={(e) => {
                      void choose(i, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                )}
                {creating && !wide && i === 0 ? (
                  <div ref={progressRef} className="ph-no-capture scroll-mt-[88px] flex flex-col gap-3 rounded-[16px] border border-[#E7E3D8] bg-[#FFF8FD] px-4 py-5" data-ph-mask>
                    <Progress photo={p?.url || theirPhoto} steps={steps} step={state.step} slow={state.slow} />
                    {emailBits}
                  </div>
                ) : picture && i === 0 ? (
                  <div className="ph-no-capture flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#F2C6EA] bg-[#FFF8FD] py-2.5 pl-2.5 pr-3" data-testid="store-ready" data-ph-mask>
                    <span className="relative h-[60px] w-[60px] flex-none">
                      {thumb("h-full w-full rounded-[10px]")}
                      <span className="absolute -bottom-1.5 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-[#8E047B]" aria-hidden="true">
                        <Check className="h-3 w-3 text-white" strokeWidth={3.4} />
                      </span>
                    </span>
                    <span role="status" className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-extrabold text-[#1a1a1a]">{petName ? t("store.readyNamed", { name: petName }) : t("store.ready")}</span>
                      <span className="text-[13px] leading-[1.4] text-[#4d4d4d]">{picture.emailAsked || emailDone ? t("store.emailedToo") : t("store.readySub")}</span>
                    </span>
                    {change}
                  </div>
                ) : p ? (
                  <div className="ph-no-capture flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#D9D5CA] py-2.5 pl-2.5 pr-3" data-testid="photo-added" data-ph-mask>
                    {thumb("h-14 w-14 flex-none rounded-[10px]")}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] font-extrabold text-[#1a1a1a]">{kept ? t("store.newPhotoAdded") : t("store.photoAdded")}</span>
                      {kept && <span className="text-[13px] leading-[1.4] text-[#4d4d4d]">{t("store.newPhotoSub")}</span>}
                    </span>
                    {change}
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
                {i === 0 && data.photoTips && !picture && !kept && (
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
                      onChange={(e) => nameChanged(i, e.target.value)}
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
                {kept && !creating && (
                  <button type="button" onClick={keepPicture} data-testid="store-keep" className="self-center px-2 py-1 text-[14px] font-extrabold text-[#8E047B] underline underline-offset-2">
                    {kept.names[0]?.trim() ? t("store.keepPictureNamed", { name: kept.names[0].trim() }) : t("store.keepPicture")}
                  </button>
                )}
              </>
            )}
            {picture && <p className="text-center text-[12px] text-[#616161]">{t("store.payments")}</p>}
            {state.phase === "failed" && (
              <div role="alert" className="flex flex-col items-start gap-2.5 rounded-[14px] bg-[#FDECEA] p-3.5 text-[14px] font-bold text-[#a1251b]" data-testid="store-failed">
                {t("store.failed")}
                <button type="button" onClick={() => openSheet(0)} className="h-10 rounded-[10px] border-[1.5px] border-[#a1251b] bg-white px-3 font-extrabold">
                  {t("store.chooseAnother")}
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
          {/* Four at a time: 2 × 2 on phones, one row on desktop; "See more gifts" adds the next ones. */}
          <div ref={giftGrid} className="grid grid-cols-2 gap-x-3 gap-y-5 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8" data-testid="store-related">
            {result && onShow
              ? related.map((r) => <RelatedWithPicture key={r.id} card={r} picture={onShow} result={result} currency={data.pricing.currency} />)
              : related.map((r, i) => <ProductCard key={r.id} card={r} currency={data.pricing.currency} position={i + 1} collection="related" from="related" />)}
          </div>
          {allRelated.length > related.length && (
            <button type="button" onClick={seeMoreGifts} data-testid="store-more-gifts" className="mx-auto mt-2 flex h-[52px] w-full max-w-[360px] items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-[#1f1f1f] bg-white text-[16px] font-extrabold text-[#1f1f1f]">
              {t("store.seeMoreGifts")}
              <ChevronDown className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          )}
        </section>
      )}

      <PhotoSheet
        open={sheetSlot != null}
        onClose={() => setSheetSlot(null)}
        current={sheetSlot != null ? photos[sheetSlot] : null}
        saved={savedPhotos}
        name={(kept ?? picture) ? (kept?.names[0] ?? names[0])?.trim() || null : null}
        hasPicture={Boolean(onShow)}
        tips={data.photoTips}
        maxMb={maxMb}
        onUpload={(file) => {
          const slot = sheetSlot ?? 0;
          setSheetSlot(null);
          void choose(slot, file);
        }}
        onReuse={(e) => {
          const slot = sheetSlot ?? 0;
          setSheetSlot(null);
          reuse(slot, e);
        }}
      />
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
      <ShopPreview template={d.template} pictureUrl={fileUrl(result.file)} crop={cropFor(result.width, result.height, d.aspect, d.placement)} pictureSize={{ width: result.width, height: result.height }} placement={d.placement} aspect={d.aspect} background={d.background} width={300} alt={t("store.yourPictureOn", { product: card.title })} className="rounded-[12px]" />
      <span data-testid="store-card-title" className="pt-1 text-[14px] font-extrabold leading-[1.3] group-hover:underline">
        {card.title}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[15px] font-extrabold text-[#1a1a1a]">{card.many ? t("store.from", { price: formatMoney(card.price, currency) }) : formatMoney(card.price, currency)}</span>
        {card.was && (
          <span className="text-[13px] text-[#616161] line-through">
            <span className="sr-only">{t("store.wasPrice", { price: "" })}</span>
            {formatMoney(card.was, currency)}
          </span>
        )}
      </span>
      <span className="text-[13px] font-extrabold text-[#8E047B]">{t("store.seeIt")}</span>
    </Link>
  );
}

/**
 * "Change photo": a sheet from the bottom on phones, a dialog on desktop. Upload a new photo, or tap one added
 * before; the one in use is marked. Escape or Close changes nothing.
 */
function PhotoSheet({
  open,
  onClose,
  current,
  saved,
  name,
  hasPicture,
  tips,
  maxMb,
  onUpload,
  onReuse,
}: {
  open: boolean;
  onClose: () => void;
  current: SlotPhoto | null;
  saved: EarlierPhoto[];
  name: string | null;
  hasPicture: boolean;
  tips: string | null;
  maxMb: number;
  onUpload: (file: File) => void;
  onReuse: (p: EarlierPhoto) => void;
}) {
  const uid = useId();
  const inUse = current && "fileId" in current ? current.fileId : null;
  const others = saved.filter((p) => p.fileId !== inUse);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={`${uid}-d`}
          data-testid="store-photo-sheet"
          className="ph-no-capture fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-white px-4 pb-6 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] focus:outline-none lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[22px] lg:p-6"
          data-ph-mask
        >
          <span className="mx-auto h-[5px] w-10 flex-none rounded-full bg-[#D9D5CA] lg:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="font-serif text-[26px] font-normal leading-[1.1] text-[#1a1a1a]">{t("store.chooseAnother")}</Dialog.Title>
              <Dialog.Description id={`${uid}-d`} className="text-[13px] leading-[1.45] text-[#4d4d4d]">
                {!hasPicture ? t("store.sheetSubFresh") : name ? t("store.sheetSubNamed", { name }) : t("store.sheetSub")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t("store.close")} className="-mr-2 -mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-[10px] hover:bg-black/5">
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <label className="relative flex cursor-pointer items-center gap-3.5 rounded-[16px] border-2 border-dashed border-[#D9A6CF] bg-[#FFF8FD] px-4 py-3.5 focus-within:ring-2 focus-within:ring-[#DD07C4]">
            <input
              type="file"
              accept={PHOTO_TYPES}
              className="sr-only"
              aria-label={t("store.uploadNew")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onUpload(f);
              }}
            />
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-pink-tint">
              <Camera className="h-6 w-6 text-[#B8059F]" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[16px] font-extrabold text-[#1a1a1a]">{t("store.uploadNew")}</span>
              <span className="text-[13px] text-[#616161]">{t("store.photoFormats", { mb: maxMb })}</span>
            </span>
          </label>

          {(current || others.length > 0) && (
            <section aria-labelledby={`${uid}-b`} className="flex flex-col gap-2.5">
              <h3 id={`${uid}-b`} className="text-[15px] font-extrabold text-[#1a1a1a]">
                {t("store.usePhotoBefore")}
              </h3>
              <div className="grid grid-cols-3 gap-2.5" data-testid="store-sheet-photos">
                {current?.url && (
                  <span className="relative block overflow-hidden rounded-[12px] border-2 border-[#DD07C4] bg-page" aria-current="true">
                    <img src={current.url} alt={t("store.photoInUse")} className="block aspect-square w-full object-cover" />
                    <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-[#8E047B] py-0.5 pl-1 pr-2 text-[11px] font-extrabold text-white">
                      <Check className="h-3 w-3" strokeWidth={3.4} aria-hidden="true" />
                      {t("store.inUse")}
                    </span>
                  </span>
                )}
                {others.slice(0, 11).map((p, n) => (
                  <button key={p.fileId} type="button" onClick={() => onReuse(p)} aria-label={t("store.earlierPhotoN", { n: n + 1 })} className="block overflow-hidden rounded-[12px] border-[1.5px] border-[#E7E3D8] bg-page focus-visible:ring-2 focus-visible:ring-[#DD07C4] focus-visible:ring-offset-2">
                    <img src={fileUrl(p.fileId)} alt="" className="block aspect-square w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {tips && (
            <div className="flex items-start gap-2.5">
              <Info className="mt-px h-[18px] w-[18px] flex-none text-[#8E047B]" aria-hidden="true" />
              <span className="text-[13px] leading-[1.5] text-[#4d4d4d]">{tips}</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

/** The picture being made: their photo in a spinning ring, then each step. */
function Progress({ photo, steps, step, slow }: { photo: string | null; steps: string[]; step: number; slow: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-5" role="status" aria-live="polite" data-testid="store-creating">
      <span className="relative flex h-[112px] w-[112px] items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-[#F6D3EF] border-t-[#DD07C4]" aria-hidden="true" />
        {photo ? <img src={photo} alt="" className="h-[92px] w-[92px] rounded-full object-cover" /> : <span className="h-[92px] w-[92px] rounded-full bg-pink-tint" aria-hidden="true" />}
      </span>
      <ol className="flex w-full max-w-[300px] flex-col gap-2 rounded-[14px] bg-white/[0.94] p-3.5 text-[14px] shadow-sm">
        {steps.map((s, i) => {
          const done = step > i;
          const now = step === i;
          return (
            <li key={i} className={cn("flex items-center gap-2.5", done ? "text-[#2b2b2b]" : now ? "font-extrabold text-[#1a1a1a]" : "text-[#8a8a8a]")} aria-current={now ? "step" : undefined}>
              {done ? <Check className="h-4 w-4 text-[#1f8a4c]" aria-hidden="true" /> : now ? <Loader2 className="h-4 w-4 animate-spin text-[#B8059F]" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border-2 border-[#D9D5CA]" aria-hidden="true" />}
              {s}
            </li>
          );
        })}
      </ol>
      {slow && <p className="max-w-[300px] rounded-[12px] bg-white/[0.94] px-3 py-2 text-center text-[14px] font-bold text-[#8E047B]">{t("store.slow")}</p>}
    </div>
  );
}

/** Shrinks an element's font size, 1 px at a time from its CSS size, until its text fits on one line (or `min`). */
function useFitText<T extends HTMLElement>(text: string, min: number) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > min) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Again once the web font has loaded: it's wider than the fallback.
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, min]);
  return ref;
}

/** True on desktop widths (the lg breakpoint), where the gallery sits beside the form. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
