"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardPreview } from "@/components/CardPreview";
import { StepHeader, StickyFooterBar } from "./StepHeader";
import { useDraft } from "./useDraft";
import type { BuilderData } from "./types";
import { isShown } from "@/lib/render/layout";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

export function PortraitStep({ data, versionId, imageId }: { data: BuilderData; versionId: string | null; imageId: string | null }) {
  const router = useRouter();
  const { draft, update, ready } = useDraft((d) => ({ ...d, versionId: versionId ?? d.versionId, imageId: imageId ?? d.imageId ?? data.defaults.imageId }));
  const version = data.versions.find((v) => v.id === draft.versionId) ?? null;
  const all = data.sessions.flatMap((s) => s.portraits);
  const portrait = all.find((p) => p.imageId === draft.imageId) ?? null;
  const [adjust, setAdjust] = useState(false);

  useEffect(() => {
    trackClient("page_view_card_portrait", { portrait_count: all.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready && !version) router.replace("/create?step=theme");
    // A design without a photo has no Portrait step.
    else if (ready && version && !isShown(version.layout.photo)) router.replace(`/create/message?v=${version.id}`);
  }, [ready, version, router]);
  if (!version) return null;

  const session = data.sessions.find((s) => s.sessionId === portrait?.sessionId);
  const label = portrait && session ? `${[session.petName, session.themeName].filter(Boolean).join(", ")} ${session.portraits.indexOf(portrait) + 1}` : t("builder.nothingSelected");

  // One grid, newest first (sessions arrive newest first), each labelled by its session.
  const items = data.sessions.flatMap((s) => {
    const title = [s.themeName, s.petName].filter(Boolean).join(" · ") || t("portraits.untitled");
    return s.portraits.map((p, i) => ({ p, s, label: t("builder.portraitN", { theme: title, n: i + 1 }) }));
  });

  return (
    <div className="mx-auto max-w-[760px] pb-28" data-testid="step-portrait">
      <StepHeader step={2} onBack={() => router.push(`/create?step=theme`)} />
      {/* Compact preview pinned under the step bar so each pick visibly changes the card; not pinned on short screens. */}
      <div className="z-20 -mx-4 bg-page/95 px-4 pb-2 pt-3 backdrop-blur [@media(min-height:700px)]:sticky [@media(min-height:700px)]:top-[106px]" data-testid="portrait-preview">
        <div className="flex items-center gap-4 rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
          <div className="w-[84px] shrink-0 lg:w-[110px]">
            <CardPreview
              layout={version.layout}
              backgroundUrl={version.backgroundUrl}
              overlayUrl={version.overlayUrl}
              portraitUrl={portrait?.imageUrl}
              crop={draft.crop}
              photoBg={version.photoBg}
              to={draft.to || t("home.theirName")}
              from={draft.from || data.firstName}
              message={draft.message}
              footerText={data.footerText}
              label={`${version.themeName} · ${version.name}`}
              maxWidth={120}
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight">{t("builder.choosePortrait")}</h1>
            <p className="mt-1 text-[14px] text-ink-2">{t("builder.choosePortraitBody", { design: version.name })}</p>
            {portrait && (
              <button type="button" className="mt-1 inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-pink-link" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> {t("builder.adjust")}
              </button>
            )}
          </div>
        </div>
        {portrait && adjust && <CropControls crop={draft.crop} onChange={(crop) => update({ crop })} />}
      </div>

      <div role="radiogroup" aria-label={t("builder.choosePortrait")} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" data-testid="portrait-grid">
        {items.map(({ p, s, label: itemLabel }) => (
          <button
            key={p.imageId}
            type="button"
            role="radio"
            aria-checked={draft.imageId === p.imageId}
            aria-label={`${itemLabel}${p.ordered ? `, ${t("portraits.ordered").toLowerCase()}` : ""}`}
            onClick={() => {
              update({ imageId: p.imageId, crop: { zoom: 1, x: 0, y: 0 } });
              trackClient("card_portrait_selected", { session_id: s.sessionId, image_id: p.imageId, was_ordered: p.ordered });
            }}
            className={cn("relative flex aspect-square items-center justify-center overflow-hidden rounded-[14px] bg-[#EFEBE1]", draft.imageId === p.imageId && "ring-[3px] ring-magenta")}
          >
            {/* The whole portrait at its own shape (no square crop). */}
            <img src={p.imageUrl} alt="" loading="lazy" width={p.width ?? undefined} height={p.height ?? undefined} className="h-full w-full object-contain" />
            {p.ordered && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#1f6b35]">{t("portraits.ordered")}</span>}
            {draft.imageId === p.imageId && (
              <span className="bg-avatar-gradient absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-white" aria-hidden="true">
                <Check className="h-4 w-4" />
              </span>
            )}
          </button>
        ))}
      </div>

      <StickyFooterBar label={t("builder.selected")} value={label}>
        <Button size="lg" disabled={!portrait} onClick={() => router.push(`/create/message?v=${version.id}&image=${portrait!.imageId}`)} data-testid="next">
          {t("builder.next")}
        </Button>
      </StickyFooterBar>
    </div>
  );
}

export function CropControls({ crop, onChange }: { crop: { zoom: number; x: number; y: number }; onChange: (c: { zoom: number; x: number; y: number }) => void }) {
  const set = (patch: Partial<typeof crop>) => {
    const next = { ...crop, ...patch };
    onChange(next);
    trackClient("card_crop_adjusted", { zoom: Math.round(next.zoom * 100) / 100 });
  };
  return (
    <div className="mt-3 grid gap-3 rounded-[16px] bg-white p-4 shadow-sm" data-testid="crop-controls">
      <Slider id="crop-zoom" label={t("builder.zoom")} min={1} max={3} step={0.05} value={crop.zoom} onChange={(v) => set({ zoom: v })} />
      <Slider id="crop-x" label={t("builder.moveX")} min={-1} max={1} step={0.05} value={crop.x} onChange={(v) => set({ x: v })} />
      <Slider id="crop-y" label={t("builder.moveY")} min={-1} max={1} step={0.05} value={crop.y} onChange={(v) => set({ y: v })} />
      <button type="button" className="link w-fit text-[14px]" onClick={() => onChange({ zoom: 1, x: 0, y: 0 })}>
        {t("builder.resetCrop")}
      </button>
    </div>
  );
}

function Slider({ id, label, min, max, step, value, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[#DD07C4]" />
    </div>
  );
}
