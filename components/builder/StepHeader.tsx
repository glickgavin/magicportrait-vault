"use client";

import { ChevronLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

const LABELS = ["builder.stepTheme", "builder.stepPortrait", "builder.stepMessage", "builder.stepReady"];

export function StepHeader({ step, onBack }: { step: 1 | 2 | 3 | 4; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          trackClient("card_step_back", { from_step: step });
          onBack();
        }}
        aria-label={t("builder.back")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/[0.06] hover:bg-black/10"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex-1">
        <div className="flex justify-between text-[14px]">
          <span className="font-bold">{t("builder.stepOf", { n: step, total: 4 })}</span>
          <span className="text-ink-2">{t(LABELS[step - 1])}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-black/10" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-label={t("builder.progress")}>
          <div className="h-full rounded-full bg-primary-gradient" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <ol className="sr-only">
          {LABELS.map((l, i) => (
            <li key={l} aria-current={i + 1 === step ? "step" : undefined}>
              {t(l)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function StickyFooterBar({ label, value, children }: { label?: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur pb-safe">
      <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 pt-3">
        {value !== undefined && (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ink-2">{label}</div>
            <div className="truncate text-[16px] font-bold">{value}</div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
