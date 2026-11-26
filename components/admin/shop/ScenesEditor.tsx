"use client";

import { useId } from "react";
import type { Template } from "@/lib/shop/template";

type Media = { id: string; url: string; alt: string | null; width: number; height: number };
type Size = { options?: { name: string; value: string }[] };

/** The product's options and their values, in order. */
function optionValues(sizes: Size[]): { name: string; values: string[] }[] {
  const out: { name: string; values: string[] }[] = [];
  for (const s of sizes)
    for (const o of s.options ?? []) {
      let g = out.find((x) => x.name === o.name);
      if (!g) out.push((g = { name: o.name, values: [] }));
      if (!g.values.includes(o.value)) g.values.push(o.value);
    }
  return out;
}

const input = "h-10 w-full min-w-0 rounded-[10px] border border-line bg-white px-3 text-[15px] font-normal";

/**
 * "A photo per option" in the template editor (docs/shop.md › Photos per option): for a framed print, the product
 * photo with a black, white or wood frame. The preview swaps photo when the customer picks a value. The picture goes
 * in the same place on each, so the photos must be the same shot. Only previews change, never the print file.
 */
export function ScenesEditor({ template, setTemplate, media, sizes }: { template: Template; setTemplate: React.Dispatch<React.SetStateAction<Template>>; media: Media[]; sizes: Size[] }) {
  const uid = useId();
  const options = optionValues(sizes).filter((o) => o.values.length > 1);
  const scenes = template.scenes;
  if (!options.length && !scenes) return null;
  const values = scenes ? (options.find((o) => o.name === scenes.option)?.values ?? Object.keys(scenes.values)) : [];
  const setScene = (value: string, mediaId: string) =>
    setTemplate((p) => {
      if (!p.scenes) return p;
      const next = { ...p.scenes.values };
      const m = media.find((x) => x.id === mediaId);
      if (!m) delete next[value];
      else next[value] = { background: { media_id: m.id, url: m.url, w: m.width, h: m.height }, overlay: null };
      return { ...p, scenes: { ...p.scenes, values: next } };
    });
  const name = (m: Media, i: number) => m.alt?.trim() || `Photo ${i + 1}`;
  return (
    <section aria-labelledby={`${uid}-t`} className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="scenes-editor">
      <div>
        <h2 id={`${uid}-t`} className="text-[17px] font-extrabold">
          A photo per option (frame colours)
        </h2>
        <p className="text-[13px] text-ink-2">Show a different product photo when the customer picks an option, such as a black, white or wood frame. Their picture goes in the same place on every photo, so use photos taken from the same angle. This changes the previews only, never what&apos;s printed.</p>
      </div>
      <label htmlFor={`${uid}-opt`} className="flex flex-col gap-1 text-[13px] font-bold sm:max-w-[320px]">
        Change the photo with
        <select
          id={`${uid}-opt`}
          className={input}
          value={scenes?.option ?? ""}
          onChange={(e) => setTemplate((p) => ({ ...p, scenes: e.target.value ? { option: e.target.value, values: p.scenes?.option === e.target.value ? p.scenes.values : {} } : undefined }))}
        >
          <option value="">Nothing: one photo for every variant</option>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
          {scenes && !options.some((o) => o.name === scenes.option) && <option value={scenes.option}>{scenes.option}</option>}
        </select>
      </label>
      {scenes && (
        <ul className="flex flex-col gap-2" data-testid="scenes-values">
          {values.map((v) => {
            const chosen = scenes.values[v]?.background ?? null;
            return (
              <li key={v} className="flex items-center gap-3 rounded-[14px] bg-black/[0.03] p-2.5">
                <img src={(chosen ?? template.background).url} alt="" className="h-14 w-14 flex-none rounded-[8px] bg-white object-cover" />
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-bold">
                  {scenes.option}: {v}
                  <select className={input} value={chosen?.media_id ?? ""} onChange={(e) => setScene(v, e.target.value)}>
                    <option value="">The main photo (above)</option>
                    {media.map((m, i) => (
                      <option key={m.id} value={m.id}>
                        {name(m, i)}
                      </option>
                    ))}
                    {chosen && !media.some((m) => m.id === chosen.media_id) && <option value={chosen.media_id}>The photo it uses now</option>}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {scenes && <p className="text-[12px] text-ink-2">To check one, pick a size with that {scenes.option.toLowerCase()} in the Live preview, or pick it in the Customer view below. Add missing photos under the product&apos;s photo list above.</p>}
    </section>
  );
}
