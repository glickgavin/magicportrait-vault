"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Clock, Gift, Heart, Info, Lock, Minus, Plus, Star, Truck } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProductPageData, VariantView } from "@/lib/open-store/pages";
import { optionGroups, variantFor } from "@/lib/open-store/view";
import type { DescriptionBlock } from "@/lib/shop/description";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";
import { ProductCard } from "./ProductCard";
import { Stars } from "./Stars";

const ICONS = { truck: Truck, heart: Heart, lock: Lock, gift: Gift, star: Star, clock: Clock } as const;

/** A photo chosen for a slot, still only in the browser (Open store 3 sends it to make the picture). */
export type ChosenPhoto = { file: File; url: string; width: number; height: number };

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

export function ProductView({ data, initialVariantId, minPhotoPx, maxMb, from }: { data: ProductPageData; initialVariantId: string | null; minPhotoPx: number; maxMb: number; from: string }) {
  const router = useRouter();
  const uid = useId();
  const groups = useMemo(() => optionGroups(data.variants), [data.variants]);
  const [variantId, setVariantId] = useState<string>(initialVariantId ?? data.variants.find((v) => v.available)?.id ?? data.variants[0]?.id);
  const variant: VariantView | undefined = data.variants.find((v) => v.id === variantId) ?? data.variants[0];
  const [shown, setShown] = useState(0);
  const [photos, setPhotos] = useState<(ChosenPhoto | null)[]>(() => data.slots.map(() => null));
  const [names, setNames] = useState<string[]>(() => data.slots.map(() => ""));
  const [photoError, setPhotoError] = useState<{ slot: number; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const relatedRef = useRef<HTMLElement | null>(null);
  const pid = data.product.legacyId;
  const themeName = data.theme?.name ?? null;

  useEffect(() => {
    trackClient("page_view_store_product", { product_id: pid, theme_slug: data.theme?.slug ?? null, has_picture: false, from });
  }, [pid, data.theme?.slug, from]);

  // "On more gifts" in view (once).
  useEffect(() => {
    const el = relatedRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        trackClient("store_related_shown", { product_id: pid, count: data.related.length, with_picture: false });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pid, data.related.length]);

  // Object URLs for chosen photos are freed when the page goes.
  useEffect(() => () => photos.forEach((p) => p && URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = Object.fromEntries((variant?.options ?? []).map((o) => [o.name, o.value]));
  const pickOption = (name: string, value: string) => {
    const next = variantFor(data.variants, { ...chosen, [name]: value });
    if (!next) return;
    setVariantId(next.id);
    router.replace(`?variant=${next.legacyId}`, { scroll: false });
    trackClient("store_variant_selected", { product_id: pid, option: name, value, has_picture: false });
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
    // HEIC often can't be read by the browser; the server converts it (Open store 3), so it's accepted here.
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!img && !heic) return fail("not_an_image", t("store.photoNotImage"));
    if (img && Math.min(img.width, img.height) < minPhotoPx) {
      URL.revokeObjectURL(img.url);
      return fail("too_small", t("store.photoTooSmall", { px: minPhotoPx }));
    }
    setPhotos((list) => {
      const next = [...list];
      if (next[slot]) URL.revokeObjectURL(next[slot]!.url);
      next[slot] = { file, url: img?.url ?? "", width: img?.width ?? 0, height: img?.height ?? 0 };
      return next;
    });
    trackClient("store_photo_chosen", { product_id: pid, ok: true, reason: null, slot: slot + 1, reused: false });
  }

  const ready = photos.every(Boolean);
  const gallery = data.gallery;
  const main = gallery[shown] ?? gallery[0];
  const price = variant ? variant.price : null;
  const was = variant?.was ?? null;
  const save = price && was ? Number(was) - Number(price) : 0;

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
        <section aria-label={t("store.pictures")} className="flex flex-col gap-2.5 lg:sticky lg:top-[88px] lg:flex-row-reverse lg:gap-4">
          <div className="ph-no-capture relative lg:flex-1">
            {main ? <img src={main.url} alt={main.alt} className="block aspect-square w-full bg-page object-cover object-top lg:rounded-[16px]" /> : <span className="block aspect-square w-full bg-page lg:rounded-[16px]" aria-hidden="true" />}
            {shown === 0 && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.sample")}</span>}
            {shown > 0 && <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-[5px] text-[12px] font-bold text-[#2b2b2b]">{t("store.example")}</span>}
            {data.pricing.pct != null && <span className="absolute right-3 top-3 rounded-full bg-[#B8059F] px-2.5 py-[5px] text-[12px] font-extrabold tracking-[0.06em] text-white">{t("store.off", { pct: Math.round(data.pricing.pct * 100) })}</span>}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 px-4 lg:flex-col lg:px-0">
              {gallery.map((g, i) => (
                <button key={g.url + i} type="button" aria-label={t("store.pictureN", { n: i + 1, count: gallery.length })} aria-current={i === shown ? "true" : undefined} onClick={() => setShown(i)} className={cn("h-16 w-16 flex-none overflow-hidden rounded-[10px] bg-page lg:h-[72px] lg:w-[72px]", i === shown ? "border-2 border-[#DD07C4]" : "border border-[#E7E3D8]")}>
                  <img src={g.url} alt="" className="block h-full w-full object-cover object-top" />
                </button>
              ))}
            </div>
          )}
        </section>

        <div>
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

          {data.slots.map((slot, i) => {
            const p = photos[i];
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
                  aria-label={p ? `${t("store.change")}: ${slot.label}` : `${t("store.choosePhoto")}: ${slot.label}`}
                  onChange={(e) => {
                    void choose(i, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {p ? (
                  <div className="ph-no-capture flex items-center gap-3 rounded-[14px] border border-[#E7E3D8] p-2.5" data-testid="photo-added">
                    {p.url ? <img src={p.url} alt={t("store.yourPhoto")} className="h-14 w-14 flex-none rounded-[10px] object-cover" /> : <span className="h-14 w-14 flex-none rounded-[10px] bg-page" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 text-[14px] font-extrabold">{t("store.photoAdded")}</span>
                    <button type="button" onClick={() => inputs.current[i]?.click()} className="h-10 rounded-[10px] border-[1.5px] border-[#1f1f1f] px-3.5 text-[14px] font-extrabold">
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
          <p className="mx-4 mt-3 text-[12px] leading-[1.5] text-[#616161] lg:mx-0">
            {t("store.consent")}{" "}
            <a href="https://magicportraits.ai/policies/privacy-policy" className="underline" target="_blank" rel="noreferrer">
              {t("store.privacy")}
            </a>
          </p>

          <section className="mx-4 mt-3.5 flex flex-col gap-2.5 lg:mx-0">
            <button
              type="button"
              disabled={!ready}
              data-testid="store-create"
              onClick={() => setNote(t("store.createSoon"))}
              className="bg-primary-gradient shadow-primary h-14 rounded-[12px] text-[17px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#E7E3D8] disabled:text-[#6b6b6b] disabled:shadow-none"
            >
              {t("store.create")}
            </button>
            <span className="text-center text-[13px] text-[#616161]">{t("store.createNote")}</span>
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

      {data.related.length > 0 && (
        <section
          ref={relatedRef}
          aria-labelledby={`${uid}-related`}
          className="flex flex-col gap-3.5 px-4 pb-[30px] pt-7 lg:px-0 lg:pt-12"
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            const n = a ? data.related.findIndex((r) => a.getAttribute("href")?.startsWith(r.href)) : -1;
            if (n >= 0) trackClient("store_related_tapped", { from_product_id: pid, to_product_id: data.related[n].legacyId, position: n + 1, with_picture: false });
          }}
        >
          <h2 id={`${uid}-related`} className="font-serif text-[24px] font-normal leading-[1.15] text-[#1a1a1a] lg:text-[32px]">
            {t("store.alsoMade")}
          </h2>
          <div className="grid grid-cols-3 gap-2.5 lg:gap-6" data-testid="store-related">
            {data.related.map((r, i) => (
              <ProductCard key={r.id} card={r} currency={data.pricing.currency} position={i + 1} collection="related" small from="related" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
