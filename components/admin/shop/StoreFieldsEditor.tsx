"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { QUALITY_ICONS, type QualityFeature } from "@/lib/open-store/lower";
import { cn } from "@/lib/utils";

/**
 * Settings › Shop › one product › Magic Store: the product's Magic Store fields (docs/open-store.md ›
 * Product settings use the store's settings framework). An empty field shows the store default in grey;
 * Save writes only what changed (POST /api/admin/shop/store-fields).
 */
export type SlotWords = { label: string; name_label?: string; name_placeholder?: string };
export type StoreFieldsValues = {
  imagen_theme: string;
  photos: SlotWords[] | null;
  /** null: the store default. */
  ask_name: boolean | null;
  name_max: number | null;
  photo_tips: string;
  subject: "" | "pet" | "person" | "any";
  images_to_show: number | null;
  step_labels: string[] | null;
  related: string[];
  open_store_related: boolean;
  details: string;
  /** "Real product, real quality": empty photo and features = none (the section is left out). */
  quality: { photo: string; alt: string; features: QualityFeature[] };
  variants: { id: string; title: string; badge: string; lead_days: string }[];
};

const NO_FEATURE: QualityFeature = { icon: "check", title: "", sub: "" };
/** The form's four feature rows, from what's stored. */
export function qualityForm(q: { photo: string; alt?: string; features: QualityFeature[] } | null): StoreFieldsValues["quality"] {
  const f = q?.features ?? [];
  return { photo: q?.photo ?? "", alt: q?.alt ?? "", features: [0, 1, 2, 3].map((i) => ({ ...NO_FEATURE, ...f[i] })) };
}
/** What's saved: null when nothing is filled in. */
function qualityValue(q: StoreFieldsValues["quality"]) {
  const features = q.features.filter((f) => f.title.trim()).map((f) => ({ icon: f.icon, title: f.title.trim(), sub: f.sub.trim() }));
  if (!q.photo.trim() && !features.length) return null;
  return { photo: q.photo.trim(), alt: q.alt.trim(), features };
}
export type StoreFieldsDefaults = { photos: SlotWords[]; ask_name: boolean; name_max: number; photo_tips: string; subject: string; images_to_show: number; step_labels: string[] };
export type ThemeOption = { slug: string; name: string; active: boolean; photos: number | null };

const input = "h-10 w-full min-w-0 rounded-[10px] border border-line bg-white px-3 text-[15px] placeholder:text-black/35";
const area = "min-h-[84px] w-full min-w-0 rounded-[10px] border border-line bg-white px-3 py-2 text-[15px] placeholder:text-black/35";

export function StoreFieldsEditor({
  productId,
  initial,
  defaults,
  themes,
  others,
  problems,
}: {
  productId: string;
  initial: StoreFieldsValues;
  defaults: StoreFieldsDefaults;
  /** Imagen's themes; null when the list couldn't be read (then the theme is typed). */
  themes: ThemeOption[] | null;
  /** Other Magic Store products, for "More gifts". */
  others: { id: string; title: string }[];
  problems: { key: string; label: string; problem: string }[];
}) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState<StoreFieldsValues>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof StoreFieldsValues>(k: K, val: StoreFieldsValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const theme = themes?.find((t) => t.slug === v.imagen_theme) ?? null;
  // One slot per photo the theme takes (Imagen's list says); else as many as the words given, at least one.
  const slots = Math.max(1, theme?.photos ?? (v.photos ?? defaults.photos).length);
  const words = (i: number): SlotWords => v.photos?.[i] ?? { label: "" };
  const setWord = (i: number, k: keyof SlotWords, val: string) => {
    const base: SlotWords[] = Array.from({ length: slots }, (_, n) => ({ ...words(n) }));
    base[i] = { ...base[i], [k]: val };
    const clean = base.map((w) => ({ label: w.label.trim(), ...(w.name_label?.trim() ? { name_label: w.name_label.trim() } : {}), ...(w.name_placeholder?.trim() ? { name_placeholder: w.name_placeholder.trim() } : {}) }));
    set("photos", clean.every((w) => !w.label && !w.name_label && !w.name_placeholder) ? null : clean);
  };
  const disagree = theme?.photos != null && v.photos != null && v.photos.length !== theme.photos;
  const problemFor = (k: string) => problems.find((p) => p.key === k)?.problem;
  const missingLabels = v.photos?.some((w) => !w.label) ?? false;
  const q = qualityValue(v.quality);
  const qualityHalf = q ? (!q.photo ? "Add the photo's link, or clear the features." : !q.features.length ? "Add at least one feature, or clear the photo." : null) : null;
  const setFeature = (i: number, k: keyof QualityFeature, val: string) => set("quality", { ...v.quality, features: v.quality.features.map((f, n) => (n === i ? { ...f, [k]: val } : f)) });

  const body = useMemo(
    () => ({
      productId,
      fields: {
        imagen_theme: v.imagen_theme.trim() || null,
        related: v.related,
        open_store_related: v.open_store_related,
        details: v.details.trim() || null,
        generation: {
          photos: v.photos,
          ask_name: v.ask_name,
          name_max: v.name_max,
          photo_tips: v.photo_tips.trim() || null,
          subject: v.subject || null,
          images_to_show: v.images_to_show,
          step_labels: v.step_labels && v.step_labels.some((s) => s.trim()) ? v.step_labels.map((s) => s.trim()) : null,
          quality: qualityValue(v.quality),
        },
      },
      variants: v.variants.map((x) => ({ variantId: x.id, badge: x.badge.trim() || null, lead_days: x.lead_days.trim() || null })),
    }),
    [productId, v],
  );

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/shop/store-fields", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (r?.ok) {
      setMsg({ ok: true, text: "Saved to Shopify." });
      router.refresh();
    } else setMsg({ ok: false, text: b?.error ?? "Couldn't save" });
  }

  const id = (k: string) => `${uid}-${k}`;
  const label = (k: string, text: string, hint?: string) => (
    <label htmlFor={id(k)} className="flex flex-col gap-0.5 text-[13px] font-bold">
      {text}
      {hint && <span className="font-normal text-ink-2">{hint}</span>}
    </label>
  );
  const flag = (k: string) => {
    const p = problemFor(k);
    return p ? <p className="text-[12px] font-bold text-[#a1251b]">Bad value in Shopify: {p}. The store default is used.</p> : null;
  };

  return (
    <div className="flex flex-col gap-5" data-testid="store-fields">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          {label("theme", "Imagen theme", "The art style. Required for a product people make pictures on.")}
          {themes ? (
            <select id={id("theme")} value={v.imagen_theme} onChange={(e) => set("imagen_theme", e.target.value)} className={input}>
              <option value="">None</option>
              {themes
                .filter((t) => t.active || t.slug === v.imagen_theme)
                .map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name} ({t.slug}){t.photos ? ` · ${t.photos} photo${t.photos === 1 ? "" : "s"}` : ""}
                    {!t.active ? " · inactive" : ""}
                  </option>
                ))}
              {v.imagen_theme && !themes.some((t) => t.slug === v.imagen_theme) && <option value={v.imagen_theme}>{v.imagen_theme} (not in Imagen&apos;s list)</option>}
            </select>
          ) : (
            <input id={id("theme")} value={v.imagen_theme} onChange={(e) => set("imagen_theme", e.target.value)} className={input} placeholder="e.g. bathroom-01" spellCheck={false} />
          )}
          {flag("imagen_theme")}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold">Related only</span>
          <label className="flex min-h-10 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={v.open_store_related} onChange={(e) => set("open_store_related", e.target.checked)} className="h-4 w-4 accent-[#DD07C4]" />
            Show it only under “On more gifts”, never in the grid
          </label>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[14px] bg-black/[0.03] p-4">
        <legend className="px-1 text-[15px] font-extrabold">Picture settings</legend>
        <p className="text-[13px] text-ink-2">
          {theme?.photos ? `The theme takes ${theme.photos} photo${theme.photos === 1 ? "" : "s"}, so the page shows ${theme.photos} slot${theme.photos === 1 ? "" : "s"}.` : "How many photos a product takes comes from its Imagen theme."} Empty fields use the store defaults (in grey).
        </p>
        {disagree && <p className="text-[13px] font-bold text-[#7a4a00]">These words are for {v.photos!.length} photo{v.photos!.length === 1 ? "" : "s"}, but the theme takes {theme!.photos}.</p>}
        {flag("photos")}
        {Array.from({ length: slots }, (_, i) => {
          const d = defaults.photos[i] ?? defaults.photos[0];
          return (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                {label(`slot-${i}-label`, `Photo ${i + 1}: label`)}
                <input id={id(`slot-${i}-label`)} value={words(i).label} onChange={(e) => setWord(i, "label", e.target.value)} className={input} placeholder={i < defaults.photos.length ? d.label : `Photo ${i + 1}`} />
              </div>
              <div className="flex flex-col gap-1">
                {label(`slot-${i}-name`, `Photo ${i + 1}: name label`)}
                <input id={id(`slot-${i}-name`)} value={words(i).name_label ?? ""} onChange={(e) => setWord(i, "name_label", e.target.value)} className={input} placeholder={d.name_label ?? ""} />
              </div>
              <div className="flex flex-col gap-1">
                {label(`slot-${i}-ph`, `Photo ${i + 1}: name example`)}
                <input id={id(`slot-${i}-ph`)} value={words(i).name_placeholder ?? ""} onChange={(e) => setWord(i, "name_placeholder", e.target.value)} className={input} placeholder={d.name_placeholder ?? ""} />
              </div>
            </div>
          );
        })}
        <div className="flex flex-col gap-1 rounded-[12px] border border-line bg-white p-3" data-testid="ask-name">
          <label className="flex items-start gap-2 text-[15px] font-semibold">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={v.ask_name ?? defaults.ask_name} onChange={(e) => set("ask_name", e.target.checked === defaults.ask_name ? null : e.target.checked)} />
            <span>
              Ask for the pet&apos;s name (used to make the picture)
              <span className="block text-[13px] font-normal text-ink-2">
                Shows the name box next to the photo and sends the name to Imagen. Turn off when the personalisation layer asks for the name, so customers aren&apos;t asked twice.
                {v.ask_name === null ? ` Store default: ${defaults.ask_name ? "on" : "off"}.` : ""}
              </span>
            </span>
          </label>
          {problemFor("ask_name") && (v.ask_name ?? defaults.ask_name) && (
            <p role="note" className="rounded-[10px] bg-[#fff1d6] px-3 py-2 text-[13px] font-semibold text-[#7a4a00]" data-testid="ask-name-twice">
              {problemFor("ask_name")}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            {label("name_max", "Name length (characters)")}
            <input id={id("name_max")} inputMode="numeric" value={v.name_max ?? ""} onChange={(e) => set("name_max", e.target.value.trim() ? Number(e.target.value) || 0 : null)} className={input} placeholder={String(defaults.name_max)} />
            {flag("name_max")}
          </div>
          <div className="flex flex-col gap-1">
            {label("images", "Results to show")}
            <input id={id("images")} inputMode="numeric" value={v.images_to_show ?? ""} onChange={(e) => set("images_to_show", e.target.value.trim() ? Number(e.target.value) || 0 : null)} className={input} placeholder={String(defaults.images_to_show)} />
            {flag("images_to_show")}
          </div>
          <div className="flex flex-col gap-1">
            {label("subject", "Subject", "Changes the copy only")}
            <select id={id("subject")} value={v.subject} onChange={(e) => set("subject", e.target.value as StoreFieldsValues["subject"])} className={input}>
              <option value="">Store default ({defaults.subject})</option>
              <option value="pet">Pet</option>
              <option value="person">Person</option>
              <option value="any">Any</option>
            </select>
            {flag("subject")}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {label("tips", "Photo tips")}
          <textarea id={id("tips")} value={v.photo_tips} onChange={(e) => set("photo_tips", e.target.value)} className={area} placeholder={defaults.photo_tips} />
          {flag("photo_tips")}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              {label(`step-${i}`, `Progress step ${i + 1}`)}
              <input
                id={id(`step-${i}`)}
                value={v.step_labels?.[i] ?? ""}
                onChange={(e) => {
                  const next = [0, 1, 2].map((n) => (n === i ? e.target.value : (v.step_labels?.[n] ?? "")));
                  set("step_labels", next.some((s) => s.trim()) ? next : null);
                }}
                className={input}
                placeholder={defaults.step_labels[i] ?? ""}
              />
            </div>
          ))}
        </div>
        {flag("step_labels")}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[15px] font-extrabold">More gifts</legend>
        <p className="text-[13px] text-ink-2">The products under “On more gifts”, in the order ticked. None ticked: the next products in the same collection.</p>
        <div className="flex flex-wrap gap-2">
          {others.map((o) => {
            const n = v.related.indexOf(o.id);
            const on = n >= 0;
            return (
              <label key={o.id} className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[14px] focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-1", on ? "border-[#DD07C4] bg-pink-tint font-bold text-pink-dark" : "border-line bg-white")}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => set("related", on ? v.related.filter((x) => x !== o.id) : [...v.related, o.id])} />
                {on && <span aria-hidden="true">{n + 1}.</span>}
                {o.title}
              </label>
            );
          })}
          {!others.length && <p className="text-[14px] text-ink-2">No other products in the Magic Store collection.</p>}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        {label("details", "Size and materials", "Shown under Product details, after the Shopify description")}
        <textarea id={id("details")} value={v.details} onChange={(e) => set("details", e.target.value)} className={area} />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[14px] bg-black/[0.03] p-4" data-testid="store-quality">
        <legend className="px-1 text-[15px] font-extrabold">Real product, real quality</legend>
        <p className="text-[13px] text-ink-2">A photo of the real product and up to 4 features, shown on the product page under its own heading. Empty: the section is left out.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            {label("q-photo", "Photo (link)", "An https:// link, e.g. from Shopify Files")}
            <input id={id("q-photo")} value={v.quality.photo} onChange={(e) => set("quality", { ...v.quality, photo: e.target.value })} className={input} placeholder="https://cdn.shopify.com/…" spellCheck={false} />
          </div>
          <div className="flex flex-col gap-1">
            {label("q-alt", "What the photo shows", "For screen readers")}
            <input id={id("q-alt")} value={v.quality.alt} onChange={(e) => set("quality", { ...v.quality, alt: e.target.value })} className={input} maxLength={200} />
          </div>
        </div>
        {v.quality.features.map((f, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
            <div className="flex flex-col gap-1">
              {label(`q-icon-${i}`, `Feature ${i + 1}: icon`)}
              <select id={id(`q-icon-${i}`)} value={f.icon} onChange={(e) => setFeature(i, "icon", e.target.value)} className={input}>
                {QUALITY_ICONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              {label(`q-title-${i}`, `Feature ${i + 1}: title`)}
              <input id={id(`q-title-${i}`)} value={f.title} onChange={(e) => setFeature(i, "title", e.target.value)} className={input} maxLength={40} placeholder={i === 0 ? "e.g. Stick anywhere" : ""} />
            </div>
            <div className="flex flex-col gap-1">
              {label(`q-sub-${i}`, `Feature ${i + 1}: a few words`)}
              <input id={id(`q-sub-${i}`)} value={f.sub} onChange={(e) => setFeature(i, "sub", e.target.value)} className={input} maxLength={60} placeholder={i === 0 ? "e.g. Any wall, no nails" : ""} />
            </div>
          </div>
        ))}
        {flag("quality")}
        {qualityHalf && <p className="text-[13px] font-bold text-[#a1251b]">{qualityHalf}</p>}
      </fieldset>

      {v.variants.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[15px] font-extrabold">Sizes</legend>
          {v.variants.map((x, i) => (
            <div key={x.id} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr]" data-testid="store-size">
              <p className="pb-2 text-[14px] font-bold">{x.title}</p>
              <div className="flex flex-col gap-1">
                {label(`badge-${i}`, `Badge (${x.title})`)}
                <input id={id(`badge-${i}`)} value={x.badge} onChange={(e) => set("variants", v.variants.map((y, n) => (n === i ? { ...y, badge: e.target.value } : y)))} className={input} placeholder="e.g. Bestseller" maxLength={24} />
              </div>
              <div className="flex flex-col gap-1">
                {label(`lead-${i}`, `Making time, working days (${x.title})`)}
                <input id={id(`lead-${i}`)} value={x.lead_days} onChange={(e) => set("variants", v.variants.map((y, n) => (n === i ? { ...y, lead_days: e.target.value } : y)))} className={input} placeholder="e.g. 4-6" />
              </div>
            </div>
          ))}
          {flag("lead_days")}
        </fieldset>
      )}

      {missingLabels && <p className="text-[13px] font-bold text-[#a1251b]">Each photo slot needs a label, or leave all of them empty to use the store default.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty || busy || missingLabels || Boolean(qualityHalf)} onClick={() => void save()}>
          {busy ? "Saving…" : "Save Magic Store fields"}
        </Button>
        {dirty && (
          <button type="button" className="text-[14px] font-bold text-pink-link" onClick={() => setV(initial)}>
            Undo changes
          </button>
        )}
        {msg && (
          <span role="status" className={cn("text-[14px] font-bold", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

/** Settings › Shop › one product › both stores: the short description (shared by both stores). */
export function ShortDescriptionEditor({ productId, initial }: { productId: string; initial: string }) {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={uid} className="flex flex-col gap-0.5 text-[13px] font-bold">
        Short description
        <span className="font-normal text-ink-2">A sentence or two, then lines starting with “- ” for bullets. Empty: the product&apos;s own Shopify description.</span>
      </label>
      <textarea id={uid} value={text} onChange={(e) => setText(e.target.value)} className={area} maxLength={1500} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={busy || text === initial}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await fetch("/api/admin/shop/store-fields", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, fields: { short_description: text.trim() || null } }) }).catch(() => null);
            const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
            setBusy(false);
            setMsg(r?.ok ? { ok: true, text: "Saved to Shopify." } : { ok: false, text: b?.error ?? "Couldn't save" });
            if (r?.ok) router.refresh();
          }}
        >
          {busy ? "Saving…" : "Save short description"}
        </Button>
        {msg && (
          <span role="status" className={cn("text-[13px] font-bold", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

/** Settings › Shop › Magic Store › Refresh themes from Imagen (POST /api/admin/shop/themes). */
export function RefreshThemesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/admin/shop/themes", { method: "POST" }).catch(() => null);
          const b = (await r?.json().catch(() => ({}))) as { error?: string; themes?: number; added?: number; removed?: number } | undefined;
          setBusy(false);
          setMsg(r?.ok ? { ok: true, text: `The theme dropdown in Shopify now has ${b?.themes} themes (${b?.added} added, ${b?.removed} removed).` } : { ok: false, text: b?.error ?? "Couldn't refresh" });
          if (r?.ok) router.refresh();
        }}
      >
        {busy ? "Refreshing…" : "Refresh themes from Imagen"}
      </Button>
      {msg && (
        <span role="status" className={cn("text-[14px] font-bold", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
