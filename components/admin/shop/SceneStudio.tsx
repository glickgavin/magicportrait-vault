"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ScenePreset } from "@/lib/shop/scene-presets";
import type { Scene } from "@/lib/shop/scenes";

type Job = { state: "making"; started: number } | { state: "error"; message: string } | undefined;

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";
const PARALLEL = 3;

function pictureLabel(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.[a-z]+$/i, "").replace(/-/g, " ");
}

export function SceneStudio({
  presets,
  titles,
  pictures,
  initial,
  usedToday,
  dailyLimit,
  model,
}: {
  presets: ScenePreset[];
  titles: Record<string, string>;
  pictures: string[];
  initial: Scene[];
  usedToday: number;
  dailyLimit: number;
  model: string;
}) {
  const [scenes, setScenes] = useState<Scene[]>(initial);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [made, setMade] = useState(usedToday);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<Scene | null>(null);
  const running = useRef(0);

  const anyMaking = Object.values(jobs).some((j) => j?.state === "making");
  useEffect(() => {
    if (!anyMaking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyMaking]);

  const groups = useMemo(() => {
    const order: string[] = [];
    for (const p of presets) if (!order.includes(p.product)) order.push(p.product);
    return order.map((h) => ({ handle: h, title: titles[h] ?? h, presets: presets.filter((p) => p.product === h) }));
  }, [presets, titles]);

  const withoutPhoto = presets.filter((p) => !scenes.some((s) => s.preset === p.id));

  async function make(p: ScenePreset): Promise<void> {
    const picture = choice[p.id] ?? p.picture;
    setJobs((j) => ({ ...j, [p.id]: { state: "making", started: Date.now() } }));
    try {
      const blob = await fetch(picture).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("picture"))));
      const form = new FormData();
      form.set("presetId", p.id);
      form.set("pictureName", picture.split("/").pop() ?? "picture.jpg");
      form.set("picture", new File([blob], picture.split("/").pop() ?? "picture.jpg", { type: blob.type || "image/jpeg" }));
      if (notes[p.id]?.trim()) form.set("note", notes[p.id].trim());
      const res = await fetch("/api/admin/shop/scene", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { scene?: Scene; error?: string; detail?: string | null } | null;
      if (!res.ok || !body?.scene) throw new Error([body?.error ?? `Something went wrong (${res.status}).`, body?.detail].filter(Boolean).join(" "));
      setScenes((s) => [body.scene!, ...s]);
      setMade((n) => n + 1);
      setJobs((j) => ({ ...j, [p.id]: undefined }));
    } catch (e) {
      const message = e instanceof Error && e.message !== "picture" ? e.message : "Couldn't load that sample picture.";
      setJobs((j) => ({ ...j, [p.id]: { state: "error", message } }));
    }
  }

  async function makeMany(list: ScenePreset[]) {
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift()!;
        running.current++;
        await make(p);
        running.current--;
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));
  }

  async function remove(s: Scene) {
    if (open?.key === s.key) setOpen(null);
    setScenes((x) => x.filter((y) => y.key !== s.key));
    const res = await fetch("/api/admin/shop/scene", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: s.key }) });
    if (!res.ok) setScenes((x) => [s, ...x]);
  }

  const left = Math.max(0, dailyLimit - made);

  return (
    <div className="flex flex-col gap-5">
      <section className={`${CARD} flex flex-wrap items-center justify-between gap-3`} aria-label="Make room photos">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {scenes.length} photo{scenes.length === 1 ? "" : "s"} kept · {made} made today, {left} left of {dailyLimit}
          </p>
          <p className="text-[13px] text-ink-2">Model: {model}. Up to {PARALLEL} are made at once; keep this page open until they finish.</p>
        </div>
        <Button disabled={anyMaking || withoutPhoto.length === 0 || left === 0} onClick={() => void makeMany(withoutPhoto.slice(0, left))}>
          {withoutPhoto.length ? `Make the ${withoutPhoto.length} scene${withoutPhoto.length === 1 ? "" : "s"} with no photo yet` : "Every scene has a photo"}
        </Button>
      </section>

      {groups.map((g) => (
        <section key={g.handle} className={CARD} aria-labelledby={`scenes-${g.handle}`}>
          <h2 id={`scenes-${g.handle}`} className="text-[19px] font-extrabold">
            {g.title}
          </h2>
          <div className="mt-3 flex flex-col gap-5">
            {g.presets.map((p) => {
              const job = jobs[p.id];
              const mine = scenes.filter((s) => s.preset === p.id);
              const picture = choice[p.id] ?? p.picture;
              return (
                <div key={p.id} className="grid gap-4 border-t border-line pt-4 first:border-t-0 first:pt-0 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <img src={picture} alt="" className="h-[84px] w-[64px] flex-none rounded-[8px] object-cover" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold">{p.label}</p>
                        <p className="text-[12px] text-ink-2">
                          {p.id} · photo {p.photo_aspect}
                        </p>
                      </div>
                    </div>
                    <details className="text-[13px] text-ink-2">
                      <summary className="cursor-pointer font-semibold text-ink">The scene</summary>
                      <p className="mt-1 leading-snug">{p.scene}</p>
                    </details>
                    <label className="flex flex-col gap-1 text-[13px] font-semibold">
                      Picture
                      <select className="h-9 rounded-[10px] border border-line bg-white px-2 text-[14px] font-normal" value={picture} onChange={(e) => setChoice((c) => ({ ...c, [p.id]: e.target.value }))}>
                        {[...new Set([p.picture, ...pictures])].map((x) => (
                          <option key={x} value={x}>
                            {pictureLabel(x)}
                            {x === p.picture ? " (the scene's own)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[13px] font-semibold">
                      Extra instruction (optional)
                      <input
                        className="h-9 rounded-[10px] border border-line bg-white px-2 text-[14px] font-normal"
                        maxLength={500}
                        placeholder="e.g. make the room brighter"
                        value={notes[p.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                      />
                    </label>
                    <div className="flex items-center gap-3">
                      <Button size="sm" disabled={job?.state === "making" || left === 0} onClick={() => void make(p)}>
                        {job?.state === "making" ? `Making… ${Math.max(0, Math.round((now - job.started) / 1000))} s` : mine.length ? "Make another" : "Make photo"}
                      </Button>
                    </div>
                    {job?.state === "error" && (
                      <p role="alert" className="rounded-[12px] bg-[#fff4f2] px-3 py-2 text-[13px] font-semibold text-[#a1251b]">
                        {job.message}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {job?.state === "making" && <div className="skeleton aspect-[4/5] rounded-[12px]" aria-label="Making a photo" />}
                    {mine.map((s) => (
                      <figure key={s.key} className="flex flex-col gap-1">
                        <button type="button" className="overflow-hidden rounded-[12px] focus-visible:outline-2" onClick={() => setOpen(s)} aria-label={`Open ${p.label}, ${pictureLabel(s.picture)}`}>
                          <img src={s.url} alt="" loading="lazy" className="w-full bg-black/[0.04] object-cover" style={{ aspectRatio: `${s.width} / ${s.height}` }} />
                        </button>
                        <figcaption className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
                          <span className="truncate">
                            {pictureLabel(s.picture)} · {s.width}×{s.height}
                          </span>
                          <button type="button" className="link flex-none font-bold" onClick={() => void remove(s)}>
                            Delete
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                    {!mine.length && job?.state !== "making" && <p className="col-span-full self-center text-[14px] text-ink-2">No photo yet.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Room photo" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setOpen(null)}>
          <img src={open.url} alt="" className="max-h-[86vh] max-w-full rounded-[12px] object-contain" />
          <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
            <a href={open.url} target="_blank" rel="noreferrer" className="rounded-[12px] bg-white px-4 py-2 text-[14px] font-bold text-ink">
              Open full size
            </a>
            <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
