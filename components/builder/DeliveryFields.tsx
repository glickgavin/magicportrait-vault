"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";
import type { Draft } from "./types";

/** "How should it reach them?" — real radio groups. */
export function DeliveryFields({ draft, update, allowSchedule, scheduleMaxDays }: { draft: Draft; update: (p: Partial<Draft>) => void; allowSchedule: boolean; scheduleMaxDays: number }) {
  const [[min, max]] = useState(() => [new Date(Date.now() + 10 * 60_000), new Date(Date.now() + scheduleMaxDays * 86_400_000)]);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <fieldset className="rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
      <legend className="sr-only">{t("builder.reachTitle")}</legend>
      <p className="text-[16px] font-bold" aria-hidden="true">
        {t("builder.reachTitle")}
      </p>
      <div className="mt-3 grid gap-2">
        {(
          [
            ["email", t("builder.emailIt"), t("builder.emailItBody")],
            ["self", t("builder.shareIt"), t("builder.shareItBody")],
          ] as const
        ).map(([value, title, body]) => (
          <label key={value} className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] border p-3", draft.delivery === value ? "border-magenta bg-pink-tint/40" : "border-line")}>
            <input
              type="radio"
              name="delivery"
              value={value}
              checked={draft.delivery === value}
              onChange={() => {
                update({ delivery: value });
                trackClient("card_delivery_selected", { delivery: value });
              }}
              className="mt-1 h-5 w-5 accent-[#DD07C4]"
            />
            <span>
              <span className="block text-[16px] font-semibold">{title}</span>
              <span className="block text-[14px] text-ink-2">{body}</span>
            </span>
          </label>
        ))}
      </div>
      {draft.delivery === "email" && (
        <div className="mt-4 grid gap-3">
          <div>
            <label htmlFor="recipient-email" className="block text-[15px] font-bold">
              {t("builder.theirEmail")}
            </label>
            <input
              id="recipient-email"
              type="email"
              autoComplete="off"
              inputMode="email"
              value={draft.recipientEmail}
              onChange={(e) => update({ recipientEmail: e.target.value })}
              className="mt-1 h-12 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 text-[16px]"
              data-ph-mask
            />
          </div>
          {allowSchedule && (
            <fieldset>
              <legend className="text-[15px] font-bold">{t("builder.when")}</legend>
              <div className="mt-1 flex gap-4">
                {(
                  [
                    ["now", t("builder.sendNow")],
                    ["later", t("builder.pickDate")],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-[15px]">
                    <input type="radio" name="when" value={v} checked={draft.when === v} onChange={() => update({ when: v })} className="h-5 w-5 accent-[#DD07C4]" />
                    {l}
                  </label>
                ))}
              </div>
              {draft.when === "later" && (
                <div className="mt-2">
                  <label htmlFor="send-at" className="block text-[14px] font-semibold">
                    {t("builder.dateTime")}
                  </label>
                  <input
                    id="send-at"
                    type="datetime-local"
                    min={local(min)}
                    max={local(max)}
                    value={draft.scheduledLocal}
                    onChange={(e) => update({ scheduledLocal: e.target.value })}
                    className="mt-1 h-12 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 text-[16px]"
                  />
                </div>
              )}
            </fieldset>
          )}
        </div>
      )}
    </fieldset>
  );
}
