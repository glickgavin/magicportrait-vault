"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CardPreview } from "@/components/CardPreview";
import { type Layout, type TextZone } from "@/lib/render/layout";
import { FONT_DEFS, fontDef, weightFor } from "@/lib/render/fonts";
import { cn } from "@/lib/utils";

type Props = {
  versionId: string;
  themeName: string;
  categoryName: string;
  initial: { name: string; status: string; isNew: boolean; layout: Layout; ideas: string[]; maxChars: number | null; backgroundUrl: string; overlayUrl: string | null; backgroundPath: string; overlayPath: string | null; samplePath: string | null; sampleUrl: string | null };
  defaultMaxChars: number;
  footerText: string;
};

type ZoneKey = "photo" | "to" | "message" | "from";
const SAMPLE = { to: "Grandma Rose", from: "Sam", message: "Wishing you the happiest day. Thought you would love seeing Biscuit in his royal robes!" };

export function TemplateEditor(p: Props) {
  const router = useRouter();
  const [name, setName] = useState(p.initial.name);
  const [isNew, setIsNew] = useState(p.initial.isNew);
  const [layout, setLayout] = useState<Layout>(p.initial.layout);
  const [ideas, setIdeas] = useState(p.initial.ideas.join("\n"));
  const [maxChars, setMaxChars] = useState<string>(p.initial.maxChars ? String(p.initial.maxChars) : "");
  const [bg, setBg] = useState({ url: p.initial.backgroundUrl, path: p.initial.backgroundPath });
  const [ov, setOv] = useState({ url: p.initial.overlayUrl, path: p.initial.overlayPath });
  // The design's own placeholder portrait; none = the built-in square / 3:4 samples.
  const [sp, setSp] = useState({ url: p.initial.sampleUrl, path: p.initial.samplePath });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [zone, setZone] = useState<ZoneKey>("photo");
  const [sample, setSample] = useState<"square" | "3x4" | "custom">(p.initial.samplePath ? "custom" : "square");
  // "Preview" hides every zone box for a clean look at the card; "Edit" shows them.
  const [showBoxes, setShowBoxes] = useState(true);
  // True while a dragged zone is snapped to the horizontal centre (shows the guide line).
  const [snapped, setSnapped] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: ZoneKey; mode: "move" | "resize"; sx: number; sy: number; start: { x: number; y: number; w: number; h: number } } | null>(null);

  const W = layout.canvas.w;
  const H = layout.canvas.h;
  const rectOf = (k: ZoneKey) => (k === "photo" ? layout.photo : { x: layout.text[k].x, y: layout.text[k].y, w: layout.text[k].w, h: layout.text[k].h ?? layout.text[k].size * 1.4 });
  const setRect = (k: ZoneKey, r: { x: number; y: number; w: number; h: number }) => {
    const c = { x: Math.round(Math.max(0, Math.min(W - 20, r.x))), y: Math.round(Math.max(0, Math.min(H - 20, r.y))), w: Math.round(Math.max(40, Math.min(W, r.w))), h: Math.round(Math.max(30, Math.min(H, r.h))) };
    setLayout((l) => (k === "photo" ? { ...l, photo: { ...l.photo, ...c } } : { ...l, text: { ...l.text, [k]: { ...l.text[k], ...c } } }));
  };
  const setText = (k: "to" | "message" | "from", patch: Partial<TextZone>) => setLayout((l) => ({ ...l, text: { ...l.text, [k]: { ...l.text[k], ...patch } } }));

  function onPointerDown(e: React.PointerEvent, key: ZoneKey, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    setZone(key);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { key, mode, sx: e.clientX, sy: e.clientY, start: rectOf(key) };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !stage.current) return;
    const scale = W / stage.current.getBoundingClientRect().width;
    const dx = (e.clientX - d.sx) * scale;
    const dy = (e.clientY - d.sy) * scale;
    if (d.mode === "move") {
      let x = d.start.x + dx;
      // Snap to the horizontal centre when the zone's middle comes within ~1.5% of the card's middle.
      const centred = (W - d.start.w) / 2;
      const snap = Math.abs(x - centred) <= W * 0.015;
      if (snap) x = centred;
      setSnapped(snap);
      setRect(d.key, { ...d.start, x, y: d.start.y + dy });
    } else {
      let w = d.start.w + dx;
      // Resizing snaps too: the zone's width that keeps it centred.
      const centredW = W - d.start.x * 2;
      const snap = Math.abs(w - centredW) <= W * 0.015;
      if (snap) w = centredW;
      setSnapped(snap);
      setRect(d.key, { ...d.start, w, h: d.start.h + dy });
    }
  }
  /** Centre the selected zone horizontally (also the arrow-key friendly way). */
  function centreZone(k: ZoneKey) {
    const r = rectOf(k);
    setRect(k, { ...r, x: (W - r.w) / 2 });
  }

  async function save(): Promise<boolean> {
    setBusy("save");
    setMsg(null);
    const r = await fetch(`/api/admin/versions/${p.versionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, isNew, layout, messageIdeas: ideas.split("\n").map((s) => s.trim()).filter(Boolean), messageMaxChars: maxChars ? Number(maxChars) : null }),
    });
    setBusy(null);
    if (!r.ok) {
      setMsg({ ok: false, text: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save" });
      return false;
    }
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
    return true;
  }
  async function upload(kind: "background" | "overlay" | "sample", file: File) {
    setBusy(kind);
    setMsg(null);
    const f = new FormData();
    f.set("kind", kind);
    f.set("file", file);
    const r = await fetch(`/api/admin/versions/${p.versionId}/upload`, { method: "POST", body: f });
    const b = (await r.json().catch(() => ({}))) as { url?: string; path?: string; errors?: string[]; error?: string; width?: number; height?: number; bytes?: number; notes?: string[] };
    setBusy(null);
    if (!r.ok) {
      setMsg({ ok: false, text: (b.errors ?? [b.error ?? "Upload failed"]).join(" · ") });
      return;
    }
    if (kind === "background") setBg({ url: b.url!, path: b.path! });
    else if (kind === "overlay") setOv({ url: b.url!, path: b.path! });
    else {
      setSp({ url: b.url!, path: b.path! });
      setSample("custom");
      setMsg({ ok: true, text: `Placeholder image saved (${b.width} × ${b.height}). It's used in this preview, the test render and the thumbnail when you publish.` });
      return;
    }
    setMsg({ ok: true, text: `${kind === "background" ? "Background" : "Overlay"} checked and saved (${b.width} × ${b.height}, ${((b.bytes ?? 0) / 1024).toFixed(0)} KB${b.notes?.length ? `; ${b.notes.join(", ")}` : ""}).${kind === "overlay" ? " It's drawn on top of everything." : ""}` });
  }
  async function removeOverlay() {
    if (!window.confirm("Remove the overlay from this design? New cards are made without it straight away if the design is live.")) return;
    setBusy("overlay");
    setMsg(null);
    const r = await fetch(`/api/admin/versions/${p.versionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ removeOverlay: true }) });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: "Couldn't remove the overlay" });
    setOv({ url: null, path: null });
    setMsg({ ok: true, text: "Overlay removed. Publish the version to refresh its thumbnail." });
    router.refresh();
  }
  async function removeSample() {
    if (!window.confirm("Remove this design's placeholder image? The built-in sample portrait is used instead.")) return;
    setBusy("sample");
    setMsg(null);
    const r = await fetch(`/api/admin/versions/${p.versionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ removeSample: true }) });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: "Couldn't remove the placeholder image" });
    setSp({ url: null, path: null });
    if (sample === "custom") setSample("square");
    setMsg({ ok: true, text: "Placeholder image removed: the built-in sample is used. Publish to refresh the thumbnail." });
  }
  async function testRender() {
    if (!(await save())) return;
    setBusy("render");
    const r = await fetch(`/api/admin/versions/${p.versionId}/render?sample=${sample}`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: "Render failed" });
    window.open(URL.createObjectURL(await r.blob()), "_blank", "noopener");
  }
  async function publish() {
    if (!(await save())) return;
    setBusy("publish");
    const r = await fetch(`/api/admin/versions/${p.versionId}/publish`, { method: "POST" });
    const b = (await r.json().catch(() => ({}))) as { themeLive?: boolean; error?: string };
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: b.themeLive ? "Published. It's live in /create now." : "Published. Set the theme to Live in the theme library to show it." } : { ok: false, text: b.error ?? "Couldn't publish" });
    router.refresh();
  }
  async function setStatus(status: "draft" | "archived") {
    await fetch(`/api/admin/versions/${p.versionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    router.refresh();
  }

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const zones: ZoneKey[] = ["photo", "to", "message", "from"];
  const visibleZones = showBoxes ? zones : [];
  const z = zone === "photo" ? null : layout.text[zone];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[14px] text-ink-2">
            <Link href="/settings/themes" className="link">
              Theme library
            </Link>{" "}
            / {p.categoryName} / {p.themeName}
          </p>
          <h1 className="text-[30px] font-extrabold tracking-tight">{name}</h1>
          <p className="text-[14px] text-ink-2">Status: {p.initial.status}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void testRender()} disabled={Boolean(busy)} className="h-11 rounded-[12px] border border-line bg-white px-4 font-semibold">
            {busy === "render" ? "Rendering…" : "Test render JPEG"}
          </button>
          <button type="button" onClick={() => void publish()} disabled={Boolean(busy)} className="h-11 rounded-[12px] bg-[#B8059F] px-4 font-semibold text-white" data-testid="publish-version">
            {busy === "publish" ? "Publishing…" : "Publish version"}
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className={cn("mt-2 min-h-[1.25rem] text-[14px] font-semibold", msg?.ok ? "text-success" : "text-danger")} data-testid="editor-message">
        {msg?.text}
      </p>

      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[20px] bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="radiogroup" aria-label="Boxes" className="flex gap-1 rounded-[10px] bg-black/[0.05] p-1 text-[13px] font-semibold">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={showBoxes === v} onClick={() => setShowBoxes(v)} className={cn("min-h-[36px] rounded-[8px] px-3", showBoxes === v ? "bg-[#2b2b2b] text-white" : "")} data-testid={v ? "mode-edit" : "mode-preview"}>
                  {v ? "Edit (show boxes)" : "Preview (hide boxes)"}
                </button>
              ))}
            </div>
            {showBoxes && (
              <button type="button" onClick={() => centreZone(zone)} className="min-h-[36px] rounded-[8px] bg-black/[0.05] px-3 text-[13px] font-semibold" data-testid="centre-zone">
                Centre {zone === "photo" ? "photo area" : `“${zone}”`} horizontally
              </button>
            )}
          </div>
          <div
            ref={stage}
            className="relative mx-auto w-full max-w-[420px] touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null;
              setSnapped(false);
            }}
          >
            <CardPreview layout={layout} backgroundUrl={bg.url} overlayUrl={ov.url} portraitUrl={sample === "custom" && sp.url ? sp.url : sample === "3x4" ? "/sample-portrait-3x4.jpg" : "/sample-portrait.jpg"} to={SAMPLE.to} from={SAMPLE.from} message={SAMPLE.message} footerText={p.footerText} label="Template preview" />
            {showBoxes && snapped && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0 border-l-2 border-dashed border-[#1990c6]" aria-hidden="true" data-testid="centre-guide" />}
            {visibleZones.map((k) => {
              const r = rectOf(k);
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  aria-label={`${k === "photo" ? "Maximum photo area" : `${k} text zone`}: drag to move`}
                  onPointerDown={(e) => onPointerDown(e, k, "move")}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 50 : 10;
                    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                    if (m[e.key]) {
                      e.preventDefault();
                      setZone(k);
                      setRect(k, { ...r, x: r.x + m[e.key][0], y: r.y + m[e.key][1] });
                    }
                  }}
                  className={cn("absolute cursor-move border-2 border-dashed", zone === k ? "border-magenta bg-magenta/10" : "border-magenta/50")}
                  style={{ left: pct(r.x, W), top: pct(r.y, H), width: pct(r.w, W), height: pct(r.h, H) }}
                  data-testid={`zone-${k}`}
                >
                  <span className="absolute -top-5 left-0 rounded bg-magenta px-1.5 text-[11px] font-bold text-white">{k === "photo" ? "Maximum photo area" : k}</span>
                  <span onPointerDown={(e) => onPointerDown(e, k, "resize")} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize border-2 border-magenta bg-white" aria-hidden="true" />
                </div>
              );
            })}
          </div>
          <div role="radiogroup" aria-label="Sample portrait" className="mt-3 flex justify-center gap-2 text-[13px] font-semibold">
            {(sp.path ? (["custom", "square", "3x4"] as const) : (["square", "3x4"] as const)).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sample === s} onClick={() => setSample(s)} className={cn("min-h-[36px] rounded-[8px] px-3", sample === s ? "bg-[#2b2b2b] text-white" : "bg-black/[0.05]")} data-testid={`sample-${s}`}>
                {s === "custom" ? "Your placeholder" : s === "square" ? "Square sample" : "3:4 sample"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[13px] text-ink-2">Drag zones to position (arrow keys move the focused zone). The photo window fits each portrait inside the maximum photo area. Output {W} × {H} px.</p>
        </div>

        <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-sm">
          <section>
            <h2 className="text-[17px] font-extrabold">Version</h2>
            <label className="mt-2 block text-[13px] font-semibold">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-line px-2 text-[15px] font-normal" />
            </label>
            <label className="mt-2 flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="h-4 w-4 accent-[#DD07C4]" /> Show &quot;New&quot; badge
            </label>
            <div className="mt-2 flex gap-2 text-[13px]">
              {p.initial.status !== "draft" && (
                <button type="button" className="rounded-[8px] border border-line px-2 py-1" onClick={() => void setStatus("draft")}>
                  Back to draft
                </button>
              )}
              {p.initial.status !== "archived" && (
                <button type="button" className="rounded-[8px] border border-line px-2 py-1" onClick={() => void setStatus("archived")}>
                  Archive
                </button>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-[17px] font-extrabold">Artwork</h2>
            {(["background", "overlay"] as const).map((kind) => (
              <div key={kind} className="mt-2 rounded-[12px] border border-dashed border-line p-3">
                <label className="block text-[14px] font-bold" htmlFor={`up-${kind}`}>
                  {kind === "background" ? "Background (JPEG or PNG)" : "Overlay (optional, transparent PNG)"}
                </label>
                <p className="truncate text-[12px] text-ink-2">{(kind === "background" ? bg.path : ov.path) ?? "None"}</p>
                <input id={`up-${kind}`} type="file" accept={kind === "background" ? "image/jpeg,image/png" : "image/png"} disabled={Boolean(busy)} onChange={(e) => e.target.files?.[0] && void upload(kind, e.target.files[0])} className="mt-1 text-[13px]" data-testid={`upload-${kind}`} />
                {kind === "overlay" && ov.path && (
                  <button type="button" onClick={() => void removeOverlay()} disabled={Boolean(busy)} className="mt-2 min-h-[36px] rounded-[8px] border border-line bg-white px-3 text-[13px] font-semibold text-danger" data-testid="remove-overlay">
                    Remove overlay
                  </button>
                )}
              </div>
            ))}
            <p className="mt-1 text-[12px] text-ink-2">Checked on upload: 1500 × 2100 (5:7 pictures of another size are resized), sRGB. Background under 2 MB, no see-through areas. Overlay: a PNG with transparency, compressed if large (up to 4 MB), drawn on top of everything.</p>
            <div className="mt-2 rounded-[12px] border border-dashed border-line p-3" data-testid="sample-section">
              <label className="block text-[14px] font-bold" htmlFor="up-sample">
                Placeholder image (optional)
              </label>
              <p className="text-[12px] text-ink-2">
                The picture shown in the photo window here, in the test render and in this design&apos;s thumbnail. Customers&apos; cards always use their own portrait. None: the built-in sample.
              </p>
              <p className="truncate text-[12px] text-ink-2">{sp.path ?? "Built-in sample"}</p>
              <input id="up-sample" type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(e) => e.target.files?.[0] && void upload("sample", e.target.files[0])} className="mt-1 text-[13px]" data-testid="upload-sample" />
              {sp.path && (
                <button type="button" onClick={() => void removeSample()} disabled={Boolean(busy)} className="mt-2 min-h-[36px] rounded-[8px] border border-line bg-white px-3 text-[13px] font-semibold text-danger" data-testid="remove-sample">
                  Remove placeholder image
                </button>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-[17px] font-extrabold">Zones</h2>
            <div role="radiogroup" aria-label="Zone to edit" className="mt-2 flex flex-wrap gap-1">
              {zones.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={zone === k} onClick={() => setZone(k)} className={cn("rounded-[8px] px-2.5 py-1 text-[13px] font-semibold", zone === k ? "bg-[#2b2b2b] text-white" : "bg-black/[0.05]")}>
                  {k === "photo" ? "Photo" : k}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(["x", "y", "w", "h"] as const).map((f) => (
                <label key={f} className="text-[12px] font-semibold uppercase">
                  {f}
                  <input type="number" value={Math.round(rectOf(zone)[f])} onChange={(e) => setRect(zone, { ...rectOf(zone), [f]: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-[8px] border border-line px-1 text-[14px] font-normal" />
                </label>
              ))}
            </div>
            {zone === "photo" ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] font-semibold">
                <label>
                  Shape
                  <select value={layout.photo.shape} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, shape: e.target.value as Layout["photo"]["shape"] } }))} className="mt-1 h-9 w-full rounded-[8px] border border-line text-[14px] font-normal">
                    {["rect", "rounded", "circle", "arch"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2">
                  Photo fit
                  <select
                    value={layout.photo.fit ?? (layout.photo.frame?.width === 0 ? "cover" : "adapt")}
                    onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, fit: e.target.value as "adapt" | "cover" } }))}
                    className="mt-1 h-9 w-full rounded-[8px] border border-line text-[14px] font-normal"
                    data-testid="photo-fit"
                  >
                    <option value="adapt">Adapt: window follows each portrait&apos;s shape</option>
                    <option value="cover">Cover: fixed window, portrait cropped (art draws the frame)</option>
                  </select>
                </label>
                <label>
                  Corner radius
                  <input type="number" value={layout.photo.radius ?? 0} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, radius: Number(e.target.value) } }))} className="mt-1 h-9 w-full rounded-[8px] border border-line px-1 text-[14px] font-normal" />
                </label>
                <label>
                  Frame colour
                  <input type="color" value={layout.photo.frame?.color ?? "#ffffff"} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, frame: { color: e.target.value.toUpperCase(), width: l.photo.frame?.width ?? 0 } } }))} className="mt-1 h-9 w-full" />
                </label>
                <label>
                  Frame width
                  <input type="number" value={layout.photo.frame?.width ?? 0} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, frame: { color: l.photo.frame?.color ?? "#FFFFFF", width: Number(e.target.value) } } }))} className="mt-1 h-9 w-full rounded-[8px] border border-line px-1 text-[14px] font-normal" />
                </label>
              </div>
            ) : (
              z && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] font-semibold">
                  <label>
                    Font
                    <select value={z.font} onChange={(e) => setText(zone as "to", { font: e.target.value as TextZone["font"], weight: undefined })} className="mt-1 h-9 w-full rounded-[8px] border border-line text-[14px] font-normal" data-testid="zone-font">
                      {(["Serif", "Sans", "Script"] as const).map((g) => (
                        <optgroup key={g} label={g === "Script" ? "Script & handwriting" : g}>
                          {FONT_DEFS.filter((f) => f.group === g).map((f) => (
                            <option key={f.name} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label>
                    Weight
                    <select value={weightFor(z.font, z.weight)} onChange={(e) => setText(zone as "to", { weight: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-[8px] border border-line text-[14px] font-normal" data-testid="zone-weight">
                      {fontDef(z.font).weights.map((w) => (
                        <option key={w} value={w}>
                          {w === 400 ? "Regular" : w === 500 ? "Medium" : w === 600 ? "Semibold" : w === 700 ? "Bold" : w === 800 ? "Extra bold" : w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Size
                    <input type="number" value={z.size} onChange={(e) => setText(zone as "to", { size: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-[8px] border border-line px-1 text-[14px] font-normal" />
                  </label>
                  <label>
                    Colour
                    <input type="color" value={z.color} onChange={(e) => setText(zone as "to", { color: e.target.value.toUpperCase() })} className="mt-1 h-9 w-full" />
                  </label>
                  <label>
                    Align
                    <select value={z.align} onChange={(e) => setText(zone as "to", { align: e.target.value as TextZone["align"] })} className="mt-1 h-9 w-full rounded-[8px] border border-line text-[14px] font-normal">
                      {["left", "center", "right"].map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                  {zone !== "message" && (
                    <label className="col-span-2">
                      Template
                      <input value={z.template ?? ""} onChange={(e) => setText(zone as "to", { template: e.target.value })} className="mt-1 h-9 w-full rounded-[8px] border border-line px-1 text-[14px] font-normal" />
                    </label>
                  )}
                </div>
              )
            )}
          </section>
          <section>
            <h2 className="text-[17px] font-extrabold">Text</h2>
            <label className="mt-2 block text-[13px] font-semibold">
              Max characters (empty = {p.defaultMaxChars})
              <input type="number" value={maxChars} onChange={(e) => setMaxChars(e.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-line px-2 text-[15px] font-normal" />
            </label>
            <label className="mt-2 block text-[13px] font-semibold">
              Message ideas, one per line ({"{pet}"} = pet name; skipped when unknown)
              <textarea value={ideas} onChange={(e) => setIdeas(e.target.value)} rows={5} className="mt-1 w-full rounded-[10px] border border-line px-2 py-1.5 text-[14px] font-normal" />
            </label>
          </section>
          <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className="h-11 rounded-[12px] bg-[#2b2b2b] font-bold text-white" data-testid="save-version">
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <details className="text-[13px] text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">Artwork rules for designers</summary>
            <ul className="mt-2 list-disc pl-5">
              <li>Background 1500 × 2100 px (5:7), sRGB, JPEG or PNG, under 2 MB.</li>
              <li>Keep the photo zone and the three text zones clear of busy detail; the system places the portrait and the text.</li>
              <li>Put the headline in the artwork (e.g. &quot;Happy Christmas&quot;), at the top, outside the zones.</li>
              <li>Overlay (optional): a transparent PNG laid over the portrait, e.g. a frame or snow. Everything outside the decoration must be fully transparent.</li>
              <li>The overlay is drawn on top of everything (portrait, frame and text), so keep its transparent areas clear where the photo and words go.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
