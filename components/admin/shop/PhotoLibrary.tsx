"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { pictureLabel, type LibraryRoom, type LibraryStudioPhoto } from "@/lib/shop/photo-library";
import { cn } from "@/lib/utils";

type Shot = { src: string; w: number; h: number; title: string; caption: string };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";

export function PhotoLibrary({ rooms, studio, editors }: { rooms: LibraryRoom[]; studio: LibraryStudioPhoto[]; editors: Record<string, string> }) {
  const products = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rooms) seen.set(r.product, r.productTitle);
    for (const s of studio) if (!seen.has(s.product)) seen.set(s.product, s.productTitle);
    return [...seen.entries()];
  }, [rooms, studio]);
  const [only, setOnly] = useState<string | null>(null);
  const [open, setOpen] = useState<{ list: Shot[]; i: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((o) => (o ? { ...o, i: (o.i + 1) % o.list.length } : o));
      if (e.key === "ArrowLeft") setOpen((o) => (o ? { ...o, i: (o.i - 1 + o.list.length) % o.list.length } : o));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const shownRooms = rooms.filter((r) => !only || r.product === only);
  const shownStudio = studio.filter((s) => !only || s.product === only);
  const current = open ? open.list[open.i] : null;

  async function copy(src: string) {
    try {
      await navigator.clipboard.writeText(new URL(src, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Products" className="flex flex-wrap gap-2">
        {[[null, "All products"] as const, ...products].map(([h, title]) => (
          <button
            key={h ?? "all"}
            type="button"
            aria-pressed={only === h}
            onClick={() => setOnly(h)}
            className={cn("h-10 rounded-full border px-4 text-[14px] font-bold", only === h ? "border-[#DD07C4] bg-pink-tint text-pink-dark" : "border-line bg-white")}
          >
            {title}
          </button>
        ))}
      </nav>

      {shownRooms.map((r) => {
        const shots: Shot[] = r.photos.map((p) => ({ src: p.src, w: p.w, h: p.h, title: r.productTitle, caption: pictureLabel(p.picture) }));
        const editor = editors[r.product];
        return (
          <section key={r.id} className={CARD} aria-labelledby={`room-${r.id}`} id={r.id}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-pink-dark">
                  {r.productTitle} · print {r.printAspect} · room
                </p>
                <h2 id={`room-${r.id}`} className="mt-1 text-[19px] font-extrabold leading-snug">
                  {r.scene}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {editor ? (
                    <Link href={`${editor}?room=${r.id}`} className="inline-flex h-10 items-center rounded-[12px] bg-ink px-4 text-[14px] font-bold text-white">
                      Use as the {r.productTitle} template →
                    </Link>
                  ) : (
                    <span className="text-[13px] text-ink-2">{r.productTitle} isn&apos;t in the Store collection, so it can&apos;t be used as a template yet.</span>
                  )}
                  <span className="text-[13px] text-ink-2">{r.photos.length} photos with sample pictures</span>
                </div>
              </div>
              <figure className="flex flex-col gap-1">
                <button type="button" className="overflow-hidden rounded-[12px] focus-visible:outline-2" onClick={() => setOpen({ list: [{ src: r.background.src, w: r.background.w, h: r.background.h, title: r.productTitle, caption: "Empty room (the template)" }], i: 0 })} aria-label={`Open the empty room for ${r.productTitle}`}>
                  <img src={r.background.src} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: `${r.background.w} / ${r.background.h}` }} />
                </button>
                <figcaption className="text-[12px] text-ink-2">The template: the white area is where the customer&apos;s picture goes.</figcaption>
              </figure>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {shots.map((s, i) => (
                <li key={s.src}>
                  <button type="button" className="flex w-full flex-col gap-1 text-left" onClick={() => setOpen({ list: shots, i })} aria-label={`Open ${s.title} with ${s.caption}`}>
                    <img src={s.src} alt="" loading="lazy" className="w-full rounded-[10px] bg-black/[0.04] object-cover" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
                    <span className="text-[12px] font-semibold text-ink-2">{s.caption}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {shownStudio.length > 0 && (
        <section className={CARD} aria-labelledby="studio-photos">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-pink-dark">In the shop now</p>
          <h2 id="studio-photos" className="mt-1 text-[19px] font-extrabold">
            Studio photos
          </h2>
          <p className="text-[14px] text-ink-2">Each Store product&apos;s current template, shown with one sample picture.</p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {shownStudio.map((s, i, all) => {
              const list: Shot[] = all.map((x) => ({ src: x.src, w: x.w, h: x.h, title: x.productTitle, caption: pictureLabel(x.picture) }));
              return (
                <li key={s.src}>
                  <button type="button" className="flex w-full flex-col gap-1 text-left" onClick={() => setOpen({ list, i })} aria-label={`Open the ${s.productTitle} studio photo`}>
                    <img src={s.src} alt="" loading="lazy" className="w-full rounded-[10px] bg-black/[0.04] object-cover" style={{ aspectRatio: `${s.w} / ${s.h}` }} />
                    <span className="text-[12px] font-semibold text-ink-2">{s.productTitle}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {current && open && (
        <div role="dialog" aria-modal="true" aria-label={`${current.title}, ${current.caption}`} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4" onClick={() => setOpen(null)}>
          <img src={current.src} alt="" className="max-h-[80vh] max-w-full rounded-[12px] object-contain" />
          <p className="text-[14px] font-bold text-white">
            {current.title} · {current.caption}
          </p>
          <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            {open.list.length > 1 && (
              <Button variant="secondary" size="sm" onClick={() => setOpen({ ...open, i: (open.i - 1 + open.list.length) % open.list.length })}>
                ← Previous
              </Button>
            )}
            <a href={current.src} download className="inline-flex h-9 items-center rounded-[10px] bg-white px-3 text-[14px] font-bold text-ink">
              Download
            </a>
            <Button variant="secondary" size="sm" onClick={() => void copy(current.src)}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
            {open.list.length > 1 && (
              <Button variant="secondary" size="sm" onClick={() => setOpen({ ...open, i: (open.i + 1) % open.list.length })}>
                Next →
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
