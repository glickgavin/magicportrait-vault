"use client";

import { CardPreview } from "@/components/CardPreview";
import { SEED_THEMES, defaultLayout } from "@/lib/seed-data";
import { parseLayout } from "@/lib/render/layout";
import { themeAssetUrl } from "@/lib/render/assets";
import { t } from "@/lib/i18n";

const PICKS = [
  ["birthday", "confetti", -8, "translate-y-3"],
  ["christmas", "snowfall", 0, "z-10 -translate-y-1"],
  ["new-year", "midnight", 8, "translate-y-3"],
] as const;

/** Three sample cards fanned out, drawn by the real card renderer. */
export function CardFan() {
  return (
    <div role="img" aria-label={t("signin.fanLabel")} className="mx-auto flex w-full max-w-[300px] items-end justify-center">
      {PICKS.map(([theme, version, rot, cls]) => {
        const v = SEED_THEMES.find((x) => x.slug === theme)!.versions.find((x) => x.slug === version)!;
        return (
          <div key={theme} className={`-mx-2 w-[34%] ${cls}`} style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
            <CardPreview
              layout={parseLayout(defaultLayout(v.look))}
              backgroundUrl={themeAssetUrl(`builtin:${theme}-${version}.jpg`)}
              portraitUrl={null}
              photoBg={v.look.photoBg}
              to={t("signin.sampleTo")}
              from={t("signin.sampleFrom")}
              message={t("signin.sampleMessage")}
              footerText=""
              label=""
              maxWidth={140}
            />
          </div>
        );
      })}
    </div>
  );
}
