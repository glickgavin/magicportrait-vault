"use client";

import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

const LABELS = ["builder.stepTheme", "builder.stepPortrait", "builder.stepMessage"];
const TOTAL = LABELS.length;

/** "Step N of 3", pinned under the site header on every builder step, with a plain back arrow. */
export function StepHeader({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  return (
    <div className="sticky top-14 z-30 -mx-4 -mt-4 flex items-center gap-1 bg-page/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-page/85" data-testid="step-bar">
      <button
        type="button"
        onClick={() => {
          trackClient("card_step_back", { from_step: step });
          onBack();
        }}
        aria-label={t("builder.back")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-magenta"
      >
        <ArrowLeft className="h-6 w-6" aria-hidden="true" />
      </button>
      <div className="flex-1 pr-2">
        <div className="flex justify-between text-[14px]">
          <span className="font-bold">{t("builder.stepOf", { n: step, total: TOTAL })}</span>
          <span className="text-ink-2">{t(LABELS[step - 1])}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-black/10" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step} aria-label={t("builder.progress")}>
          <div className="h-full rounded-full bg-primary-gradient" style={{ width: `${(step / TOTAL) * 100}%` }} />
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
