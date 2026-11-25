"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FONT_DEFS } from "@/lib/render/fonts";
import { cssFamily, ensureFonts } from "@/lib/render/fonts-browser";
import { defaultLayerText, LAYER_ART_MAX, LAYER_TEXT_IDS, layerSchema, type Layer, type LayerArt, type LayerBox, type LayerText, type LayerTextId, type LayerValues } from "@/lib/shop/layer";
import { flatPicture, type MakeCanvas, type PreviewCtx } from "@/lib/shop/preview";
import type { Template } from "@/lib/shop/template";
import { cn } from "@/lib/utils";

/**
 * The template editor's personalisation layer (docs/shop.md › Personalisation layer): up to two text boxes and one
 * picture slot, placed on the print area. What the Magic Store customer fills in is drawn here with the sample
 * words, so what you see is what they'll see, and what gets printed.
 */

export type ArtItem = { id: string; name: string; kind: "png" | "svg"; url: string; width: number; height: number; archived: boolean };

const input = "h-10 w-full min-w-0 rounded-[10px] border border-line bg-white px-3 text-[15px] font-normal";
const browserCanvas: MakeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d") as unknown as PreviewCtx };
};

const imgs = new Map<string, Promise<HTMLImageElement | null>>();
export function loadArt(url: string): Promise<HTMLImageElement | null> {
  let p = imgs.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
    imgs.set(url, p);
  }
  return p;
}

/** What the editor previews with: each box's placeholder (or its label), and the first picture offered. */
export function sampleValues(layer: Layer): LayerValues {
  const v: LayerValues = {};
  for (const t of layer.texts) v[t.id] = t.placeholder || t.label;
  v.art = layer.art?.choices[0] ?? null;
  return v;
}

/** The images a layer offers, loaded, by id. */
export async function loadLayerArt(layer: Layer | undefined, art: ArtItem[]): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  for (const id of layer?.art?.choices ?? []) {
    const item = art.find((a) => a.id === id);
    const img = item ? await loadArt(item.url) : null;
    if (img) out.set(id, img);
  }
  return out;
}

/** The layer's problems before publishing, in words; null when it's fine. */
export function layerProblem(layer: Layer | undefined): string | null {
  if (!layer?.enabled) return null;
  if (!layer.texts.length && !layer.art) return "Add a text box or a picture slot, or turn the layer off.";
  if (layer.art && !layer.art.choices.length) return "Choose at least one picture for the picture slot, or remove the slot.";
  const r = layerSchema.safeParse(layer);
  if (r.success) return null;
  const i = r.error.issues[0];
  return `Personalisation: ${i.path.join(" ")} ${i.message}`.trim();
}

type Target = { kind: "text"; id: LayerTextId } | { kind: "art" };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const fitBox = (b: LayerBox): LayerBox => {
  const w = Math.min(1, Math.max(0.02, r3(b.w)));
  const h = Math.min(1, Math.max(0.02, r3(b.h)));
  return { w, h, x: Math.min(1 - w, Math.max(0, r3(b.x))), y: Math.min(1 - h, Math.max(0, r3(b.y))) };
};

export function LayerEditor({
  template,
  setTemplate,
  aspect,
  sample,
  art,
  setArt,
  askName = false,
  productLegacyId = "",
}: {
  template: Template;
  setTemplate: React.Dispatch<React.SetStateAction<Template>>;
  /** Width ÷ height of the print area. */
  aspect: number;
  /** A sample picture to show the layer on (the first live-preview picture), or null for a plain one. */
  sample: string | null;
  art: ArtItem[];
  setArt: React.Dispatch<React.SetStateAction<ArtItem[]>>;
  askName?: boolean;
  productLegacyId?: string;
}) {
  const uid = useId();
  const layer = template.layer;
  const on = Boolean(layer?.enabled);
  const setLayer = (fn: (l: Layer) => Layer) => setTemplate((p) => ({ ...p, layer: fn(p.layer ?? { enabled: true, texts: [], art: null }) }));
  const setText = (id: LayerTextId, patch: Partial<LayerText>) => setLayer((l) => ({ ...l, texts: l.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setArtSlot = (patch: Partial<LayerArt>) => setLayer((l) => (l.art ? { ...l, art: { ...l.art, ...patch } } : l));
  const setBox = (t: Target, b: LayerBox) => (t.kind === "art" ? setArtSlot({ box: fitBox(b) }) : setText(t.id, { box: fitBox(b) }));

  // The flat print area with the sample picture and the layer, drawn by the same routine as the store.
  const canvas = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on || !layer) return;
    let cancelled = false;
    void (async () => {
      await ensureFonts(layer.texts.map((t) => t.font));
      const pic = sample ? await loadArt(sample) : null;
      const artMap = await loadLayerArt(layer, art);
      if (cancelled || !canvas.current) return;
      const plain = browserCanvas(600, 600);
      const pc = plain.ctx as unknown as CanvasRenderingContext2D;
      const g = pc.createLinearGradient(0, 0, 600, 600);
      g.addColorStop(0, "#8a6a52");
      g.addColorStop(1, "#2f3d55");
      pc.fillStyle = g;
      pc.fillRect(0, 0, 600, 600);
      const p = (pic ?? plain.canvas) as unknown as { width: number; height: number };
      const flat = flatPicture({ picture: p, crop: { x: 0, y: 0, w: p.width, h: p.height }, placement: "cover", backgroundColour: null, targetAspect: aspect, makeCanvas: browserCanvas, flatMax: 700, template: { ...template, mask: { kind: "none", radius: 0 } }, layer: { layer, values: sampleValues(layer), art: artMap, family: cssFamily } });
      const el = canvas.current;
      el.width = flat.w;
      el.height = flat.h;
      el.getContext("2d")!.drawImage(flat.canvas as HTMLCanvasElement, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [on, layer, template, aspect, sample, art]);

  const drag = useRef<{ target: Target; mode: "move" | "size"; x: number; y: number; box: LayerBox } | null>(null);
  const frac = (e: React.PointerEvent) => {
    const r = panel.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const f = frac(e);
    const dx = f.x - d.x;
    const dy = f.y - d.y;
    setBox(d.target, d.mode === "move" ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy } : { ...d.box, w: d.box.w + dx, h: d.box.h + dy });
  };

  const [busy, setBusy] = useState(false);
  const [artMsg, setArtMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function uploadArt(file: File) {
    setBusy(true);
    setArtMsg(null);
    const body = new FormData();
    body.set("file", file);
    body.set("name", file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Picture");
    const r = await fetch("/api/admin/layer-art", { method: "POST", body }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { art?: ArtItem; error?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !b?.art) return setArtMsg(b?.error ?? "Couldn't upload that file.");
    setArt((list) => [b.art!, ...list]);
    setLayer((l) => (l.art && l.art.choices.length < LAYER_ART_MAX ? { ...l, art: { ...l.art, choices: [...l.art.choices, b.art!.id] } } : l));
  }

  const targets: (Target & { label: string; box: LayerBox })[] = [
    ...(layer?.texts ?? []).map((t) => ({ kind: "text" as const, id: t.id, label: t.label || (t.id === "t1" ? "Text 1" : "Text 2"), box: t.box })),
    ...(layer?.art ? [{ kind: "art" as const, label: layer.art.label || "Picture", box: layer.art.box }] : []),
  ];
  const offered = art.filter((a) => !a.archived || layer?.art?.choices.includes(a.id));

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="layer-editor">
      <div>
        <h2 id={`${uid}-title`} className="text-[17px] font-extrabold">
          Personalisation layer
        </h2>
        <p className="text-[13px] text-ink-2">Text and a picture the customer adds on top of their portrait, in the Magic Store. It&apos;s shown on the previews and printed exactly where you place it.</p>
      </div>
      <label className="flex items-center gap-2 text-[14px] font-bold">
        <input type="checkbox" checked={on} onChange={(e) => setTemplate((p) => ({ ...p, layer: { ...(p.layer ?? { texts: [defaultLayerText("t1")], art: null }), enabled: e.target.checked } }))} />
        Let customers personalise this product
      </label>

      {on && layer && askName && layer.texts.length > 0 && (
        <p role="note" className="rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[13px] text-[#7a4a00]" data-testid="layer-name-twice">
          This product also asks for the pet&apos;s name next to the photo (for the picture), so customers may be asked twice. If a text box here is for the name, untick “Ask for the pet&apos;s name” on the{" "}
          <a href={`/settings/shop/products/${productLegacyId}?tab=magic`} className="font-bold underline">
            product&apos;s page
          </a>
          .
        </p>
      )}
      {on && layer && (
        <>
          <div
            ref={panel}
            className="relative mx-auto w-full max-w-[420px] touch-none select-none overflow-hidden rounded-[10px] bg-black/[0.04]"
            style={{ aspectRatio: `${aspect}` }}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
            data-testid="layer-panel"
          >
            <canvas ref={canvas} role="img" aria-label="The print area with the personalisation layer" className="absolute inset-0 h-full w-full" />
            {targets.map((t) => (
              <div key={t.kind === "art" ? "art" : t.id} className="absolute border-2 border-dashed border-[#DD07C4] bg-[#DD07C4]/10" style={{ left: `${t.box.x * 100}%`, top: `${t.box.y * 100}%`, width: `${t.box.w * 100}%`, height: `${t.box.h * 100}%` }}>
                <button
                  type="button"
                  aria-label={`${t.label}: drag to move, or use the arrow keys (Shift for bigger steps)`}
                  className="absolute inset-0 cursor-move focus:outline-none focus-visible:ring-4 focus-visible:ring-[#DD07C4]/40"
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    drag.current = { target: t, mode: "move", ...frac(e), box: t.box };
                  }}
                  onPointerMove={onMove}
                  onPointerUp={() => (drag.current = null)}
                  onKeyDown={(e) => {
                    const s = e.shiftKey ? 0.05 : 0.01;
                    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
                    if (!d) return;
                    e.preventDefault();
                    setBox(t, { ...t.box, x: t.box.x + d[0], y: t.box.y + d[1] });
                  }}
                />
                <span className="pointer-events-none absolute left-0 top-0 bg-[#8E047B] px-1 text-[11px] font-bold text-white">{t.label}</span>
                <button
                  type="button"
                  aria-label={`${t.label}: drag to resize, or use the arrow keys`}
                  className="absolute -bottom-3 -right-3 z-10 h-6 w-6 cursor-nwse-resize rounded-full border-2 border-white bg-[#DD07C4] shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-[#DD07C4]/40"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    drag.current = { target: t, mode: "size", ...frac(e), box: t.box };
                  }}
                  onPointerMove={onMove}
                  onPointerUp={() => (drag.current = null)}
                  onKeyDown={(e) => {
                    const s = e.shiftKey ? 0.05 : 0.01;
                    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
                    if (!d) return;
                    e.preventDefault();
                    setBox(t, { ...t.box, w: t.box.w + d[0], h: t.box.h + d[1] });
                  }}
                />
              </div>
            ))}
          </div>
          <p className="text-[12px] text-ink-2">The print area, shown with each box&apos;s sample words. Drag a box to move it; drag its corner dot to resize.</p>

          {LAYER_TEXT_IDS.map((id, n) => {
            const t = layer.texts.find((x) => x.id === id);
            const name = `Text ${n + 1}`;
            if (!t)
              return (
                <Button key={id} variant="secondary" size="sm" className="self-start" onClick={() => setLayer((l) => ({ ...l, texts: [...l.texts, defaultLayerText(id)].sort((a, b) => a.id.localeCompare(b.id)) }))}>
                  + Add {name.toLowerCase()}
                </Button>
              );
            const f = (k: string) => `${uid}-${id}-${k}`;
            return (
              <fieldset key={id} className="flex flex-col gap-3 rounded-[14px] bg-black/[0.03] p-3" data-testid={`layer-text-${id}`}>
                <legend className="sr-only">{name}</legend>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-extrabold">{name}</p>
                  <button type="button" className="text-[13px] font-bold text-[#a1251b]" onClick={() => setLayer((l) => ({ ...l, texts: l.texts.filter((x) => x.id !== id) }))}>
                    Remove {name.toLowerCase()}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor={f("label")} className="flex flex-col gap-1 text-[13px] font-bold">
                    What to ask the customer ({name})
                    <input id={f("label")} className={input} value={t.label} maxLength={40} onChange={(e) => setText(id, { label: e.target.value })} />
                  </label>
                  <label htmlFor={f("ph")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Example words ({name})
                    <input id={f("ph")} className={input} value={t.placeholder} maxLength={60} onChange={(e) => setText(id, { placeholder: e.target.value })} />
                  </label>
                  <label htmlFor={f("font")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Font ({name})
                    <select id={f("font")} className={input} value={t.font} onChange={(e) => setText(id, { font: e.target.value as LayerText["font"], weight: undefined })}>
                      {(["Serif", "Sans", "Script"] as const).map((g) => (
                        <optgroup key={g} label={g}>
                          {FONT_DEFS.filter((d) => d.group === g).map((d) => (
                            <option key={d.name} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={f("size")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Size ({name}): {Math.round(t.size * 100)}% of the height
                    <input id={f("size")} type="range" min={0.01} max={0.3} step={0.005} value={t.size} onChange={(e) => setText(id, { size: Number(e.target.value), minSize: t.minSize && t.minSize > Number(e.target.value) ? Number(e.target.value) : t.minSize })} />
                  </label>
                  <label htmlFor={f("color")} className="flex items-center gap-2 text-[13px] font-bold">
                    <input id={f("color")} type="color" className="h-10 w-14 rounded-[8px] border border-line bg-white" value={t.color} onChange={(e) => setText(id, { color: e.target.value.toUpperCase() })} />
                    Colour ({name})
                  </label>
                  <label htmlFor={f("align")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Line up ({name})
                    <select id={f("align")} className={input} value={t.align} onChange={(e) => setText(id, { align: e.target.value as LayerText["align"] })}>
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label htmlFor={f("max")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Most characters ({name})
                    <input id={f("max")} type="number" min={1} max={120} className={input} value={t.maxChars} onChange={(e) => setText(id, { maxChars: Math.min(120, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                  </label>
                  <label htmlFor={f("lines")} className="flex flex-col gap-1 text-[13px] font-bold">
                    Most lines ({name})
                    <input id={f("lines")} type="number" min={1} max={6} className={input} value={t.maxLines} onChange={(e) => setText(id, { maxLines: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[13px] font-bold">
                  <input type="checkbox" checked={t.required} onChange={(e) => setText(id, { required: e.target.checked })} />
                  The customer must fill this in ({name})
                </label>
                <BoxInputs name={name} box={t.box} onChange={(b) => setText(id, { box: fitBox(b) })} />
              </fieldset>
            );
          })}

          {!layer.art ? (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => setLayer((l) => ({ ...l, art: { label: "Add a picture", required: false, box: { x: 0.7, y: 0.05, w: 0.25, h: 0.25 }, choices: [] } }))}>
              + Add a picture slot
            </Button>
          ) : (
            <fieldset className="flex flex-col gap-3 rounded-[14px] bg-black/[0.03] p-3" data-testid="layer-art">
              <legend className="sr-only">Picture slot</legend>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-extrabold">Picture slot</p>
                <button type="button" className="text-[13px] font-bold text-[#a1251b]" onClick={() => setLayer((l) => ({ ...l, art: null }))}>
                  Remove the picture slot
                </button>
              </div>
              <label htmlFor={`${uid}-art-label`} className="flex flex-col gap-1 text-[13px] font-bold">
                What to ask the customer (picture)
                <input id={`${uid}-art-label`} className={input} value={layer.art.label} maxLength={40} onChange={(e) => setArtSlot({ label: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-[13px] font-bold">
                <input type="checkbox" checked={layer.art.required} onChange={(e) => setArtSlot({ required: e.target.checked })} />
                The customer must choose one (otherwise “None” is offered)
              </label>
              <div>
                <p className="text-[13px] font-bold" id={`${uid}-lib`}>
                  Pictures offered ({layer.art.choices.length} of {LAYER_ART_MAX}), from the art library
                </p>
                <ul aria-labelledby={`${uid}-lib`} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="layer-art-library">
                  {offered.map((a) => {
                    const chosen = layer.art!.choices.includes(a.id);
                    const full = !chosen && layer.art!.choices.length >= LAYER_ART_MAX;
                    return (
                      <li key={a.id}>
                        <label className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border-2 bg-white p-1 text-center text-[12px] focus-within:ring-2 focus-within:ring-[#DD07C4]", chosen ? "border-[#DD07C4]" : "border-transparent", full && "cursor-not-allowed opacity-50")}>
                          <input type="checkbox" className="sr-only" checked={chosen} disabled={full} onChange={(e) => setArtSlot({ choices: e.target.checked ? [...layer.art!.choices, a.id] : layer.art!.choices.filter((x) => x !== a.id) })} />
                          <img src={a.url} alt="" className="h-14 w-14 object-contain [background:repeating-conic-gradient(#eee_0_25%,#fff_0_50%)_0_0/12px_12px]" />
                          <span className="line-clamp-2 break-all">
                            {a.name}
                            {a.archived ? " (archived)" : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  <li>
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="grid h-full min-h-20 w-full place-items-center rounded-[10px] border border-dashed border-[#DD07C4]/60 bg-pink-tint/40 text-[12px] font-bold text-pink-dark disabled:opacity-60">
                      {busy ? "Uploading…" : "+ Upload PNG or SVG"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/svg+xml,.svg"
                      className="sr-only"
                      aria-label="Upload a picture to the art library"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadArt(file);
                      }}
                    />
                  </li>
                </ul>
                {artMsg && (
                  <p role="alert" className="mt-1 text-[13px] font-bold text-[#a1251b]">
                    {artMsg}
                  </p>
                )}
                <p className="mt-1 text-[12px] text-ink-2">The library is shared by every product; each offers at most {LAYER_ART_MAX}. PNGs need a see-through background.</p>
              </div>
              <BoxInputs name="Picture" box={layer.art.box} onChange={(b) => setArtSlot({ box: fitBox(b) })} />
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}

/** A box's place and size as numbers, in % of the print area, for exact placement and keyboard users. */
function BoxInputs({ name, box, onChange }: { name: string; box: LayerBox; onChange: (b: LayerBox) => void }) {
  const uid = useId();
  const fields: [keyof LayerBox, string][] = [
    ["x", "From the left"],
    ["y", "From the top"],
    ["w", "Width"],
    ["h", "Height"],
  ];
  return (
    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
      {fields.map(([k, label]) => (
        <label key={k} htmlFor={`${uid}-${k}`} className="flex flex-col gap-1 text-[12px] font-bold">
          {label} % ({name})
          <input id={`${uid}-${k}`} type="number" min={0} max={100} step={0.5} className={input} value={Math.round(box[k] * 1000) / 10} onChange={(e) => onChange({ ...box, [k]: (Number(e.target.value) || 0) / 100 })} />
        </label>
      ))}
    </div>
  );
}
