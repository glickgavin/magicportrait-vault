"use client";

import { useId } from "react";
import { t } from "@/lib/i18n";
import type { Layer, LayerTextId, LayerValues } from "@/lib/shop/layer";
import { cn } from "@/lib/utils";

/**
 * The Magic Store's "Personalise it" step (docs/open-store.md › Personalise): the text boxes and picture choice the
 * product's template offers. The preview above redraws as they type; nothing is sent until Add to cart, where the
 * server checks it all again. The words are the customer's own: masked in session replay, never tracked.
 */
export function Personalise({ layer, art, values, onChange, error, note }: { layer: Layer; art: { id: string; name: string; url: string }[]; values: LayerValues; onChange: (v: LayerValues) => void; error: { field: LayerTextId | "art"; text: string } | null; note?: string | null }) {
  const uid = useId();
  const choices = layer.art ? layer.art.choices.map((id) => art.find((a) => a.id === id)).filter((a) => a !== undefined) : [];
  return (
    <section className="mx-4 mt-6 flex flex-col gap-3.5 lg:mx-0" aria-labelledby={`${uid}-title`} data-testid="store-personalise">
      <div>
        <h2 id={`${uid}-title`} className="text-[17px] font-extrabold text-[#1a1a1a]">
          {t("store.personalise")}
        </h2>
        <p className="text-[13px] text-[#616161]">{note ?? t("store.personaliseSub")}</p>
      </div>
      {layer.texts.map((box) => {
        const v = values[box.id] ?? "";
        const bad = error?.field === box.id;
        return (
          <div key={box.id} className="flex flex-col gap-2">
            <label htmlFor={`${uid}-${box.id}`} className="text-[15px] font-extrabold text-[#1a1a1a]">
              {box.label} <span className="text-[13px] font-semibold text-[#6b6b6b]">({box.required ? t("store.required") : t("store.optional")})</span>
            </label>
            <input
              id={`${uid}-${box.id}`}
              type="text"
              value={v}
              maxLength={box.maxChars}
              autoComplete="off"
              required={box.required}
              aria-invalid={bad || undefined}
              aria-describedby={bad ? `${uid}-${box.id}-err` : `${uid}-${box.id}-count`}
              placeholder={box.placeholder ? `e.g. ${box.placeholder}` : undefined}
              onChange={(e) => onChange({ ...values, [box.id]: e.target.value })}
              className={cn("ph-no-capture h-[52px] rounded-[12px] border-[1.5px] bg-white px-3.5 text-[16px] text-[#1a1a1a]", bad ? "border-[#a1251b]" : "border-[#D9D5CA]")}
              data-ph-mask
            />
            <span id={`${uid}-${box.id}-count`} className="self-end text-[12px] text-[#6b6b6b]" aria-live="polite">
              {t("store.nameCount", { count: [...v].length, max: box.maxChars })}
            </span>
            {bad && (
              <p id={`${uid}-${box.id}-err`} role="alert" className="text-[14px] font-bold text-[#a1251b]">
                {error.text}
              </p>
            )}
          </div>
        );
      })}
      {layer.art && choices.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-extrabold text-[#1a1a1a]">
            {layer.art.label} <span className="text-[13px] font-semibold text-[#6b6b6b]">({layer.art.required ? t("store.required") : t("store.optional")})</span>
          </legend>
          <div role="radiogroup" aria-label={layer.art.label} className="flex flex-wrap gap-2.5">
            {!layer.art.required && (
              <label className={cn("flex h-[76px] w-[76px] cursor-pointer items-center justify-center rounded-[12px] border-2 text-[14px] font-bold focus-within:ring-2 focus-within:ring-[#DD07C4]", !values.art ? "border-[#DD07C4] bg-pink-tint" : "border-[#E7E3D8] bg-white")}>
                <input type="radio" className="sr-only" name={`${uid}-art`} checked={!values.art} onChange={() => onChange({ ...values, art: null })} />
                {t("store.noPicture")}
              </label>
            )}
            {choices.map((a) => (
              <label key={a.id} className={cn("flex h-[76px] w-[76px] cursor-pointer items-center justify-center rounded-[12px] border-2 bg-[#F6F4EE] p-1.5 focus-within:ring-2 focus-within:ring-[#DD07C4]", values.art === a.id ? "border-[#DD07C4]" : "border-[#E7E3D8]")}>
                <input type="radio" className="sr-only" name={`${uid}-art`} checked={values.art === a.id} onChange={() => onChange({ ...values, art: a.id })} />
                <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
              </label>
            ))}
          </div>
          {error?.field === "art" && (
            <p role="alert" className="text-[14px] font-bold text-[#a1251b]">
              {error.text}
            </p>
          )}
        </fieldset>
      )}
    </section>
  );
}
