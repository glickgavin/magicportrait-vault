"use client";

import { Check, Clock, Droplet, Flag, Frame, Gift, Heart, Lock, Move, Pause, Play, Ruler, ShieldCheck, Sparkles, Star, Sticker, Sun, Truck } from "lucide-react";
import { useId, useState } from "react";
import type { LowerPage } from "@/lib/open-store/pages";
import { initialOf, scoreText, trustpilotColour, trustpilotStars, wallRows, type ProductQuality } from "@/lib/open-store/lower";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * The product page's trust card and lower sections (docs/open-store.md › Product page, items 9 and 12 to 18).
 * Every word, number and photo comes from settings, or the product's own fields in Shopify; a section with
 * nothing to show is left out.
 */

const CARD = "rounded-[18px] border border-[#EEE8DE] bg-white shadow-[0_1px_2px_rgba(60,45,30,0.05),0_6px_18px_rgba(60,45,30,0.07)]";
const H2 = "font-serif text-[28px] font-normal leading-[1.1] text-[#1a1a1a] lg:text-[36px]";

const GUARANTEE_ICON = { shield: ShieldCheck, sparkles: Sparkles, heart: Heart, lock: Lock, truck: Truck, gift: Gift, star: Star, clock: Clock } as const;
const QUALITY_ICON = { check: Check, sticker: Sticker, move: Move, shield: ShieldCheck, flag: Flag, sparkles: Sparkles, heart: Heart, star: Star, frame: Frame, ruler: Ruler, sun: Sun, droplet: Droplet, gift: Gift, clock: Clock, truck: Truck } as const;

type Trustpilot = NonNullable<LowerPage["trustpilot"]>;

/** Trustpilot's mark: its green star and its name. */
function TrustpilotMark() {
  return (
    <span className="flex items-center gap-1">
      <svg className="h-[15px] w-[15px] flex-none" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#00B67A" d="M12 0l2.88 8.04 8.53.25-6.75 5.22 2.39 8.2L12 16.9l-7.05 4.81 2.39-8.2L.59 8.29l8.53-.25z" />
        <path fill="#005128" d="M16.66 13.51l2.39 8.2-6.48-4.42z" />
      </svg>
      <span className="text-[13px] font-extrabold tracking-tight text-[#191919]">Trustpilot</span>
    </span>
  );
}

/** Trustpilot's five star squares, filled to the score as Trustpilot rounds it. Decorative: the score is in words beside it. */
export function TrustpilotStars({ score, size = 14 }: { score: number; size?: number }) {
  const colour = trustpilotColour(score);
  return (
    <span className="flex flex-none items-center gap-[2px]" aria-hidden="true">
      {trustpilotStars(score).map((s, i) => (
        <span key={i} className="flex items-center justify-center" style={{ width: size, height: size, background: s === "full" ? colour : s === "half" ? `linear-gradient(90deg, ${colour} 50%, #DCDCE6 50%)` : "#DCDCE6" }}>
          <Star style={{ width: size * 0.66, height: size * 0.66 }} fill="#FFFFFF" stroke="none" />
        </span>
      ))}
    </span>
  );
}

/** "Great · 4.1 out of 5" with Trustpilot's mark and stars. */
function TrustpilotLine({ tp, className }: { tp: Trustpilot; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] leading-none text-[#1F1B1A]", className)}>
      <TrustpilotMark />
      <TrustpilotStars score={tp.score} />
      <span className="whitespace-nowrap">
        {tp.label ? (
          <>
            <strong>{tp.label}</strong> · {t("store.trustpilotOutOf", { score: scoreText(tp.score) })}
          </>
        ) : (
          t("store.trustpilotOutOf", { score: scoreText(tp.score) })
        )}
      </span>
    </span>
  );
}

/** Under the title: "★★★★☆ 4.1 on Trustpilot · read reviews", a link down to the reviews (or the customer photos). */
export function TrustpilotTop({ tp, href }: { tp: Trustpilot; href: string }) {
  return (
    <a href={href} className="flex w-fit items-center gap-2 text-[13px] text-[#4d4d4d] hover:underline" data-testid="store-trustpilot-top">
      <TrustpilotStars score={tp.score} size={15} />
      <span>
        <span className="sr-only">{t("store.trustpilotRated", { score: scoreText(tp.score) })}. </span>
        <span aria-hidden="true">{t("store.trustpilotTop", { score: scoreText(tp.score) })} · </span>
        {t("store.readReviews")}
      </span>
    </a>
  );
}

/** Under the main button: three numbers, then the Trustpilot line. */
export function TrustCard({ stats, tp }: { stats: LowerPage["trustStats"]; tp: LowerPage["trustpilot"] }) {
  if (!stats.length && !tp) return null;
  return (
    <section aria-label={t("store.trustCard")} className={cn(CARD, "mx-4 mt-[18px] flex flex-col gap-3 rounded-[16px] p-3.5 lg:mx-0")} data-testid="store-trust">
      {stats.length > 0 && (
        <ul className={cn("grid gap-1.5", stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {stats.map((s, i) => (
            <li key={i} className={cn("flex min-w-0 flex-col items-center gap-px text-center", i > 0 && "border-l border-[#EEE8DE]")}>
              <strong className="whitespace-nowrap text-[16px] leading-tight text-[#1a1a1a] min-[390px]:text-[17px]">{s.value}</strong>
              <span className="text-[12px] leading-[1.3] text-[#5F5954]">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {stats.length > 0 && tp && <span className="h-px w-full bg-[#EEE8DE]" aria-hidden="true" />}
      {tp && <TrustpilotLine tp={tp} />}
    </section>
  );
}

/** Before their first picture: three steps with photos. */
export function HowItWorks({ steps }: { steps: LowerPage["howSteps"] }) {
  const uid = useId();
  if (!steps.length) return null;
  return (
    <section aria-labelledby={`${uid}-how`} className="mt-8 bg-page lg:-mx-10 lg:mt-4" data-testid="store-how">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-12 lg:px-10 lg:py-14">
        <h2 id={`${uid}-how`} className={cn(H2, "text-center")}>
          {t("store.howTitle")}
        </h2>
        <ol className="grid gap-3.5 lg:grid-cols-3 lg:gap-6">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3.5 rounded-[16px] border border-[#EEE8DE] bg-white p-3">
              <Photo src={s.image} alt={s.alt} className="h-24 w-24 flex-none rounded-[12px]" />
              <span className="flex min-w-0 flex-col gap-1">
                <strong className="text-[18px] leading-tight text-[#1a1a1a]">{s.title}</strong>
                <span className="text-[14px] leading-[1.45] text-[#4d4d4d]">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** This product's own photo and up to four features (its fields in Shopify). */
export function RealQuality({ quality }: { quality: ProductQuality }) {
  const uid = useId();
  const [failed, setFailed] = useState(false);
  if (!quality || failed) return null;
  return (
    <section aria-labelledby={`${uid}-q`} className="flex flex-col gap-6 px-4 pt-14 lg:px-0 lg:pt-16" data-testid="store-quality-section">
      <h2 id={`${uid}-q`} className={cn(H2, "text-center")}>
        {t("store.qualityTitle")}
      </h2>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <img src={quality.photo} alt={quality.alt} onError={() => setFailed(true)} loading="lazy" className="block aspect-[4/3] w-full rounded-[24px] bg-page object-cover lg:w-[58%]" />
        <ul className="grid flex-1 grid-cols-2 gap-3">
          {quality.features.map((f, i) => {
            const Icon = QUALITY_ICON[f.icon] ?? Check;
            return (
              <li key={i} className={cn(CARD, "flex flex-col gap-2.5 p-4")}>
                <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-pink-tint">
                  <Icon className="h-[22px] w-[22px] text-[#B8059F]" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[15px] leading-tight text-[#1a1a1a] lg:text-[16px]">{f.title}</strong>
                  {f.sub && <span className="text-[13px] leading-[1.35] text-[#616161] lg:text-[14px]">{f.sub}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** "Already in their homes": customers' photos in two rows that drift in opposite directions, with a pause button. */
export function Homes({ photos, tp, pet, reviewsUrl }: { photos: string[]; tp: LowerPage["trustpilot"]; pet: boolean; reviewsUrl: string | null }) {
  const uid = useId();
  const [paused, setPaused] = useState(false);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const shown = photos.filter((p) => !gone.has(p));
  if (!shown.length) return null;
  const [a, b] = wallRows(shown);
  const hide = (src: string) => setGone((g) => new Set(g).add(src));
  return (
    <section id="store-homes" aria-labelledby={`${uid}-h`} className="scroll-mt-[72px] flex flex-col items-center gap-2.5 overflow-hidden pt-16 lg:-mx-10 lg:pt-[72px]" data-testid="store-homes">
      <style>{`
        .mmp-wall-track { display: flex; gap: 10px; width: max-content; animation: mmpWall var(--mmp-wall-s, 200s) linear infinite; }
        .mmp-wall-rev .mmp-wall-track { animation-direction: reverse; }
        .mmp-wall-paused .mmp-wall-track, .mmp-wall-row:hover .mmp-wall-track { animation-play-state: paused; }
        @keyframes mmpWall { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (min-width: 1024px) { .mmp-wall-track { gap: 12px; animation-duration: 120s; } }
        @media (prefers-reduced-motion: reduce) { .mmp-wall-track { animation: none; } }
      `}</style>
      <span className="px-4 text-[13px] font-extrabold uppercase tracking-[0.14em] text-[#B8059F]">{pet ? t("store.homesEyebrowPet") : t("store.homesEyebrow")}</span>
      <h2 id={`${uid}-h`} className={cn(H2, "px-4 text-center")}>
        {t("store.homesTitle")}
      </h2>
      {tp && (
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4">
          <TrustpilotLine tp={tp} />
          {reviewsUrl && (
            <a href={reviewsUrl} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-[#8E047B] underline underline-offset-2">
              {t("store.readAllReviews")}
              <span className="sr-only"> {t("store.newTab")}</span>
            </a>
          )}
        </span>
      )}
      <div className={cn("mt-4 flex w-full flex-col gap-2.5 lg:mt-6 lg:gap-3", paused && "mmp-wall-paused")}>
        {[a, b].map((row, r) =>
          row.length ? (
            <div key={r} className={cn("mmp-wall-row overflow-hidden", r === 1 && "mmp-wall-rev")}>
              <div className="mmp-wall-track">
                {[...row, ...row].map((src, i) => (
                  <img key={`${src}-${i}`} src={src} alt="" onError={() => hide(src)} loading="lazy" decoding="async" draggable={false} className="block h-[150px] w-auto flex-none rounded-[8px] bg-[#EDE8DA] object-cover lg:h-[220px] lg:rounded-[10px]" />
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
      <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="mt-1 flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-[#4d4d4d] hover:bg-black/5 motion-reduce:hidden" data-testid="store-homes-pause">
        {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
        {paused ? t("store.homesPlay") : t("store.homesPause")}
      </button>
    </section>
  );
}

/** Real reviews from settings (never written by us), with the Trustpilot score and a link to all of them. */
export function Reviews({ reviews, tp }: { reviews: LowerPage["reviews"]; tp: LowerPage["trustpilot"] }) {
  const uid = useId();
  if (!reviews.length) return null;
  return (
    <section id="store-reviews" aria-labelledby={`${uid}-r`} className="scroll-mt-[72px] flex flex-col items-center gap-6 px-4 pt-16 lg:px-0 lg:pt-[72px]" data-testid="store-reviews">
      <div className="flex flex-col items-center gap-2">
        <h2 id={`${uid}-r`} className={cn(H2, "text-center")}>
          {t("store.reviewsTitle")}
        </h2>
        {tp && (
          <span className="flex items-center gap-2.5 text-[14px] text-[#4d4d4d]">
            <TrustpilotStars score={tp.score} size={16} />
            {tp.count != null ? t("store.reviewsLine", { score: scoreText(tp.score), count: tp.count.toLocaleString("en-US") }) : t("store.reviewsLineNoCount", { score: scoreText(tp.score) })}
          </span>
        )}
      </div>
      <ul className="grid w-full gap-4 lg:grid-cols-3">
        {reviews.map((r, i) => (
          <li key={i} className={cn(CARD, "flex flex-col gap-3 rounded-[20px] p-5")}>
            <span className="flex items-center gap-3">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-page text-[17px] font-extrabold text-[#8E047B]" aria-hidden="true">
                {initialOf(r.name)}
              </span>
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-[15px] text-[#1a1a1a]">{r.name}</strong>
                {r.source && <span className="text-[13px] text-[#616161]">{t("store.reviewFrom", { source: r.source })}</span>}
              </span>
            </span>
            <p className="text-[15px] leading-[1.55] text-[#2b2b2b]">“{r.text}”</p>
          </li>
        ))}
      </ul>
      {tp?.url && (
        <a href={tp.url} target="_blank" rel="noreferrer" className="text-[15px] font-bold text-[#8E047B] underline underline-offset-2">
          {t("store.readAllReviews")}
          <span className="sr-only"> {t("store.newTab")}</span>
        </a>
      )}
    </section>
  );
}

/** "We've got you covered": up to four promises. */
export function Guarantees({ items }: { items: LowerPage["guarantees"] }) {
  const uid = useId();
  if (!items.length) return null;
  return (
    <section aria-labelledby={`${uid}-g`} className="flex flex-col gap-5 px-4 pt-16 lg:px-0 lg:pt-[72px]" data-testid="store-covered">
      <h2 id={`${uid}-g`} className={cn(H2, "text-center")}>
        {t("store.coveredTitle")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((g, i) => {
          const Icon = GUARANTEE_ICON[g.icon] ?? ShieldCheck;
          return (
            <li key={i} className={cn(CARD, "flex flex-col items-center gap-2 px-3.5 py-[18px] text-center")}>
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-pink-tint">
                <Icon className="h-5 w-5 text-[#B8059F]" strokeWidth={1.9} aria-hidden="true" />
              </span>
              <strong className="text-[15px] leading-tight text-[#1a1a1a]">{g.title}</strong>
              <span className="text-[13px] leading-[1.45] text-[#616161]">{g.body}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Quick questions": real disclosure widgets, one per question. */
export function Faq({ items, onOpen }: { items: LowerPage["faq"]; onOpen: (n: number) => void }) {
  const uid = useId();
  if (!items.length) return null;
  return (
    <section aria-labelledby={`${uid}-f`} className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 pt-16 lg:px-0 lg:pt-[72px]" data-testid="store-faq">
      <h2 id={`${uid}-f`} className={cn(H2, "text-center")}>
        {t("store.faqTitle")}
      </h2>
      <div className="flex flex-col gap-2.5">
        {items.map((f, i) => (
          <details key={i} className={cn(CARD, "group rounded-[16px] px-4 py-1")} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen(i)}>
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-extrabold text-[#1a1a1a] [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="flex-none text-[22px] font-normal leading-none text-[#616161] transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="pb-4 text-[15px] leading-[1.55] text-[#4d4d4d]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The last card on the page: the same next step as the main button. */
export function ClosingCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const uid = useId();
  return (
    <section aria-labelledby={`${uid}-c`} className="px-4 pb-16 pt-16 lg:px-0 lg:pb-[72px] lg:pt-[72px]" data-testid="store-closing">
      <div className={cn(CARD, "mx-auto flex max-w-[640px] flex-col items-center gap-2.5 rounded-[24px] px-6 py-[34px] text-center")}>
        <h2 id={`${uid}-c`} className="font-serif text-[26px] font-normal leading-[1.1] text-[#1a1a1a] lg:text-[32px]">
          {title}
        </h2>
        <p className="text-[15px] text-[#4d4d4d]">{sub}</p>
        <div className="mt-2.5 flex w-full max-w-[400px] flex-col">{children}</div>
      </div>
    </section>
  );
}

/** A photo from settings that hides itself (keeping its space) if its link stops working. */
function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={cn("block bg-[#EDE8DA]", className)} aria-hidden="true" /> : <img src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" className={cn("block bg-[#EDE8DA] object-cover", className)} />;
}
