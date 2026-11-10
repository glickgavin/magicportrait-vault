"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { centredCrop } from "@/lib/shop/fit";
import { drawPreview, previewSize, type MakeCanvas, type PreviewCtx } from "@/lib/shop/preview";
import { defaultTemplate, zoneAspect, zoneMapper, type Template } from "@/lib/shop/template";
import { cn } from "@/lib/utils";

type Media = { id: string; url: string; alt: string | null; width: number; height: number };
type Size = { id: string; title: string; aspect: number; placement: "cover" | "contain" | "wrap_zone"; background: string | null };

const browserCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
};

/** A made-up test picture: four coloured quarters and a grid, so warps and flips show. */
function samplePicture(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = browserCanvas(w, h);
  const c = ctx as unknown as CanvasRenderingContext2D;
  const cols = ["#E4572E", "#29335C", "#F3A712", "#669BBC"];
  cols.forEach((col, i) => {
    c.fillStyle = col;
    c.fillRect((i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
  });
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = Math.max(2, w / 200);
  for (let i = 1; i < 8; i++) {
    c.beginPath();
    c.moveTo((w * i) / 8, 0);
    c.lineTo((w * i) / 8, h);
    c.moveTo(0, (h * i) / 8);
    c.lineTo(w, (h * i) / 8);
    c.stroke();
  }
  return canvas as HTMLCanvasElement;
}

const SAMPLES = [
  ["Square", 1200, 1200],
  ["3:4 portrait", 900, 1200],
  ["Landscape", 1500, 1000],
] as const;

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image"));
    i.src = url;
  });
}

const clamp = (v: number) => Math.min(1.2, Math.max(-0.2, Math.round(v * 1000) / 1000));

type HandleId = "c0" | "c1" | "c2" | "c3" | "left" | "right" | "top" | "bottom";

export function ShopTemplateEditor({ productId, media, published, sizes }: { productId: string; media: Media[]; published: Template | null; sizes: Size[] }) {
  const router = useRouter();
  const uid = useId();
  const draftKey = `shop-template-draft:${productId}`;
  const startFrom = useMemo<Template>(() => published ?? defaultTemplate({ media_id: media[0].id, url: media[0].url, w: media[0].width, h: media[0].height }), [published, media]);
  const [t, setT] = useState<Template>(startFrom);
  const [restored, setRestored] = useState(false);
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<HandleId | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const size = sizes.find((s) => s.id === sizeId) ?? null;
  const dirty = JSON.stringify(t) !== JSON.stringify(startFrom);

  // Draft: kept in this browser only, until Publish.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        setT(JSON.parse(raw) as Template);
        setRestored(true);
      }
    } catch {
      /* no storage: no draft */
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      if (dirty) window.localStorage.setItem(draftKey, JSON.stringify(t));
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [t, dirty, draftKey]);

  // Test renders with the shared drawing routine.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bg, ov] = await Promise.all([loadImg(t.background.url), t.overlay ? loadImg(t.overlay.url) : Promise.resolve(null)]);
        if (cancelled) return;
        SAMPLES.forEach(([, pw, ph], i) => {
          const el = canvases.current[i];
          if (!el) return;
          const out = previewSize(t, 360);
          el.width = out.w;
          el.height = out.h;
          const ctx = el.getContext("2d") as unknown as PreviewCtx;
          const pic = samplePicture(pw, ph);
          const aspect = size?.aspect ?? zoneAspect(t.zone, t.background.w, t.background.h);
          const placement = size?.placement ?? (t.zone.kind === "wrap" ? "wrap_zone" : "cover");
          const crop = placement === "contain" ? { x: 0, y: 0, w: pw, h: ph } : centredCrop(pw, ph, aspect, 1);
          drawPreview(ctx, { template: t, background: bg, overlay: ov, picture: pic, crop, placement, backgroundColour: size?.background ?? null, targetAspect: aspect, size: out, makeCanvas: browserCanvas, flatMax: 700 });
        });
      } catch {
        /* the photo didn't load; the editor still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, size]);

  const bgW = t.background.w;
  const bgH = t.background.h;
  const outline = useMemo(() => {
    const m = zoneMapper(t.zone, 1, 1);
    const pts: string[] = [];
    const n = t.zone.kind === "wrap" ? 24 : 1;
    for (let i = 0; i <= n; i++) pts.push(`${m(i / n, 0).x * 100},${m(i / n, 0).y * 100}`);
    for (let i = n; i >= 0; i--) pts.push(`${m(i / n, 1).x * 100},${m(i / n, 1).y * 100}`);
    return pts.join(" ");
  }, [t.zone]);

  const handles = useMemo(() => {
    const z = t.zone;
    if (z.kind === "corners") return z.points.map(([x, y], i) => ({ id: `c${i}` as HandleId, x, y, label: ["Top left", "Top right", "Bottom right", "Bottom left"][i] }));
    const m = zoneMapper(z, 1, 1);
    return [
      { id: "left" as HandleId, ...m(0, 0.5), label: "Left edge" },
      { id: "right" as HandleId, ...m(1, 0.5), label: "Right edge" },
      { id: "top" as HandleId, ...m(0.5, 0), label: "Top edge" },
      { id: "bottom" as HandleId, ...m(0.5, 1), label: "Bottom edge" },
    ];
  }, [t.zone]);

  const move = useCallback((id: HandleId, x: number, y: number) => {
    setT((prev) => {
      const z = prev.zone;
      if (z.kind === "corners" && id.startsWith("c")) {
        const i = Number(id.slice(1));
        const points = z.points.map((p, k) => (k === i ? [clamp(x), clamp(y)] : p)) as typeof z.points;
        return { ...prev, zone: { ...z, points } };
      }
      if (z.kind === "wrap") {
        const curve = z.curve;
        if (id === "left") return { ...prev, zone: { ...z, left: clamp(Math.min(x, z.right - 0.02)) } };
        if (id === "right") return { ...prev, zone: { ...z, right: clamp(Math.max(x, z.left + 0.02)) } };
        if (id === "top") return { ...prev, zone: { ...z, top: clamp(Math.min(y - curve, z.bottom - 0.02)) } };
        if (id === "bottom") return { ...prev, zone: { ...z, bottom: clamp(Math.max(y - curve, z.top + 0.02)) } };
      }
      return prev;
    });
  }, []);

  function toFrac(e: { clientX: number; clientY: number }) {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  const aspectWarning = useMemo(() => {
    if (!size) return null;
    const za = zoneAspect(t.zone, bgW, bgH);
    const diff = Math.abs(za - size.aspect) / size.aspect;
    return diff > 0.05 ? `The zone is ${za.toFixed(2)} wide for every 1 tall, but ${size.title} prints at ${size.aspect.toFixed(2)}. The picture will look stretched.` : null;
  }, [t.zone, bgW, bgH, size]);

  async function publish() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/shop/template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, template: t }) });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (r.ok) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setRestored(false);
      setMsg({ ok: true, text: "Published to Shopify." });
      router.refresh();
    } else setMsg({ ok: false, text: b.error ?? "Couldn't publish" });
  }

  const mediaField = (which: "background" | "overlay") => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[14px] font-bold">{which === "background" ? "Photo of the blank product" : "Overlay on top (optional, a transparent PNG)"}</legend>
      <div role="radiogroup" aria-label={which === "background" ? "Blank product photo" : "Overlay"} className="flex flex-wrap gap-2">
        {which === "overlay" && (
          <label className={cn("grid h-16 w-16 cursor-pointer place-items-center rounded-[10px] border text-[13px] focus-within:ring-2 focus-within:ring-[#DD07C4]", !t.overlay ? "border-[#DD07C4] bg-pink-tint font-bold" : "border-line bg-white")}>
            <input type="radio" className="sr-only" name={`${uid}-${which}`} checked={!t.overlay} onChange={() => setT((p) => ({ ...p, overlay: null }))} />
            None
          </label>
        )}
        {media.map((m) => {
          const on = which === "background" ? t.background.media_id === m.id : t.overlay?.media_id === m.id;
          return (
            <label key={m.id} className={cn("cursor-pointer rounded-[10px] border-2 p-0.5 focus-within:ring-2 focus-within:ring-[#DD07C4]", on ? "border-[#DD07C4]" : "border-transparent")}>
              <input
                type="radio"
                className="sr-only"
                name={`${uid}-${which}`}
                checked={on}
                onChange={() => {
                  const v = { media_id: m.id, url: m.url, w: m.width, h: m.height };
                  setT((p) => (which === "background" ? { ...p, background: v } : { ...p, overlay: v }));
                }}
              />
              <img src={m.url} alt={m.alt ?? "Product photo"} className="h-14 w-14 rounded-[8px] object-cover" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Zone" className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        {restored && (
          <p role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] text-[#7a4a00]">
            Your unpublished draft was restored.
            <button type="button" className="font-bold underline" onClick={() => { setT(startFrom); setRestored(false); }}>
              Discard draft
            </button>
          </p>
        )}
        <div ref={areaRef} className="relative mx-auto w-full max-w-[640px] touch-none select-none" style={{ aspectRatio: `${bgW} / ${bgH}` }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const f = toFrac(e);
            move(drag.current, f.x, f.y);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <img src={t.background.url} alt="Blank product" className="absolute inset-0 h-full w-full rounded-[12px] object-fill" draggable={false} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <polygon points={outline} fill="rgba(221,7,196,0.18)" stroke="#DD07C4" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
          </svg>
          {handles.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-label={`${h.label}: move with the arrow keys`}
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#DD07C4] shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-[#DD07C4]/40"
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                drag.current = h.id;
              }}
              onPointerMove={(e) => {
                if (drag.current !== h.id) return;
                const f = toFrac(e);
                move(h.id, f.x, f.y);
              }}
              onPointerUp={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.02 : 0.004;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (!d) return;
                e.preventDefault();
                move(h.id, h.x + d[0], h.y + d[1]);
              }}
            />
          ))}
        </div>
        {aspectWarning && (
          <p role="alert" className="mt-3 rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] text-[#7a4a00]">
            {aspectWarning}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-5">
        <section aria-label="Template settings" className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
          {mediaField("background")}
          <fieldset>
            <legend className="mb-1 text-[14px] font-bold">Shape of the zone</legend>
            <div role="radiogroup" className="flex gap-2">
              {(
                [
                  ["corners", "Flat, four corners"],
                  ["wrap", "Curved, like a mug"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={cn("inline-flex h-10 cursor-pointer items-center rounded-full border px-3 text-[14px] focus-within:ring-2 focus-within:ring-[#DD07C4]", t.zone.kind === k ? "border-[#DD07C4] bg-pink-tint font-bold text-pink-dark" : "border-line bg-white")}>
                  <input type="radio" className="sr-only" name={`${uid}-kind`} checked={t.zone.kind === k} onChange={() => setT((p) => ({ ...p, zone: defaultTemplate(p.background, k).zone }))} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {t.zone.kind === "wrap" && (
            <div className="grid gap-3">
              <label className="flex flex-col gap-1 text-[14px] font-bold">
                Curve of the top and bottom edges
                <input type="range" min={0} max={0.12} step={0.002} value={t.zone.curve} onChange={(e) => setT((p) => (p.zone.kind === "wrap" ? { ...p, zone: { ...p.zone, curve: Number(e.target.value) } } : p))} />
              </label>
              <label className="flex flex-col gap-1 text-[14px] font-bold">
                How far it wraps round
                <input type="range" min={0.2} max={1} step={0.01} value={t.zone.spread} onChange={(e) => setT((p) => (p.zone.kind === "wrap" ? { ...p, zone: { ...p.zone, spread: Number(e.target.value) } } : p))} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[14px] font-bold">
              Visible shape
              <select value={t.mask.kind} onChange={(e) => setT((p) => ({ ...p, mask: { kind: e.target.value as Template["mask"]["kind"], radius: e.target.value === "rounded" ? p.mask.radius || 0.04 : 0 } }))} className="h-10 rounded-[10px] border border-line bg-white px-2 font-normal">
                <option value="none">Square corners</option>
                <option value="rounded">Rounded corners</option>
                <option value="circle">Circle</option>
              </select>
            </label>
            {t.mask.kind === "rounded" && (
              <label className="flex flex-col gap-1 text-[14px] font-bold">
                Corner size
                <input type="range" min={0.005} max={0.25} step={0.005} value={t.mask.radius} onChange={(e) => setT((p) => ({ ...p, mask: { ...p.mask, radius: Number(e.target.value) } }))} />
              </label>
            )}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={t.blend === "multiply"} onChange={(e) => setT((p) => ({ ...p, blend: e.target.checked ? "multiply" : "normal" }))} />
            Let the product&apos;s shading show through the picture
          </label>
          {mediaField("overlay")}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button disabled={busy || (!dirty && Boolean(published))} onClick={() => void publish()}>
              {busy ? "Publishing…" : "Publish to Shopify"}
            </Button>
            {dirty && (
              <button type="button" className="text-[14px] font-bold text-pink-link" onClick={() => setT(startFrom)}>
                Undo changes
              </button>
            )}
            {msg && (
              <span role="status" className={cn("text-[14px]", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
                {msg.text}
              </span>
            )}
          </div>
        </section>

        <section aria-labelledby={`${uid}-tests`} className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${uid}-tests`} className="text-[17px] font-extrabold">
              Test renders
            </h2>
            {sizes.length > 0 && (
              <label className="flex items-center gap-2 text-[13px]">
                Size
                <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="h-9 rounded-[10px] border border-line bg-white px-2">
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {!sizes.length && <p className="mt-1 text-[13px] text-ink-2">No size has print rules yet, so these use the zone&apos;s own shape.</p>}
          <div className="mt-3 grid grid-cols-3 gap-2" data-preview="true">
            {SAMPLES.map(([label], i) => (
              <figure key={label} className="flex flex-col gap-1">
                <canvas ref={(el) => { canvases.current[i] = el; }} className="w-full rounded-[10px] bg-black/[0.04]" aria-label={`Test render with a ${label.toLowerCase()} picture`} role="img" />
                <figcaption className="text-center text-[12px] text-ink-2">{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
