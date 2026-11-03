"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardPreview } from "@/components/CardPreview";
import { StepHeader, StickyFooterBar } from "./StepHeader";
import { useDraft } from "./useDraft";
import type { BuilderData, ClientSession } from "./types";
import { t } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
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
  }, [ready, version, router]);
  if (!version) return null;

  const session = data.sessions.find((s) => s.sessionId === portrait?.sessionId);
  const label = portrait && session ? `${[session.petName, session.themeName].filter(Boolean).join(", ")} ${session.portraits.indexOf(portrait) + 1}` : t("builder.nothingSelected");

  return (
    <div className="mx-auto max-w-[760px] pb-28" data-testid="step-portrait">
      <StepHeader step={2} onBack={() => router.push(`/create?step=theme`)} />
      <div className="mt-5 flex items-center gap-4 rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <div className="w-[96px] shrink-0">
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
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">{t("builder.choosePortrait")}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{t("builder.choosePortraitBody", { design: version.name })}</p>
        </div>
      </div>

      {portrait && (
        <div className="mt-3">
          <button type="button" className="inline-flex items-center gap-2 text-[15px] font-semibold text-pink-link" aria-expanded={adjust} onClick={() => setAdjust((a) => !a)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> {t("builder.adjust")}
          </button>
          {adjust && <CropControls crop={draft.crop} onChange={(crop) => update({ crop })} />}
        </div>
      )}

      {data.sessions.map((s) => (
        <SessionPicker key={s.sessionId} s={s} selected={draft.imageId} onPick={(id, ordered) => {
          update({ imageId: id, crop: { zoom: 1, x: 0, y: 0 } });
          trackClient("card_portrait_selected", { session_id: s.sessionId, image_id: id, was_ordered: ordered });
        }} />
      ))}

      <StickyFooterBar label={t("builder.selected")} value={label}>
        <Button size="lg" disabled={!portrait} onClick={() => router.push(`/create/message?v=${version.id}&image=${portrait!.imageId}`)} data-testid="next">
          {t("builder.next")}
        </Button>
      </StickyFooterBar>
    </div>
  );
}

function SessionPicker({ s, selected, onPick }: { s: ClientSession; selected: string | null; onPick: (id: string, ordered: boolean) => void }) {
  const title = [s.themeName, s.petName].filter(Boolean).join(" · ") || t("portraits.untitled");
  return (
    <section className="mt-5" aria-labelledby={`s-${s.sessionId}`}>
      <div className="flex items-baseline justify-between">
        <h2 id={`s-${s.sessionId}`} className="text-[17px] font-bold">
          {title}
        </h2>
        <span className="text-[13px] text-ink-2">{fmtDate(s.createdAt)}</span>
      </div>
      <div role="radiogroup" aria-label={t("builder.portraitsLabel", { theme: title })} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {s.portraits.map((p, i) => (
          <button
            key={p.imageId}
            type="button"
            role="radio"
            aria-checked={selected === p.imageId}
            aria-label={`${t("builder.portraitN", { theme: title, n: i + 1 })}${p.ordered ? `, ${t("portraits.ordered").toLowerCase()}` : ""}`}
            onClick={() => onPick(p.imageId, p.ordered)}
            className={cn("relative aspect-square overflow-hidden rounded-[14px] bg-[#EADFD0]", selected === p.imageId && "ring-[3px] ring-magenta")}
          >
            <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            {p.ordered && <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#1f6b35]">{t("portraits.ordered")}</span>}
            {selected === p.imageId && (
              <span className="bg-avatar-gradient absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white" aria-hidden="true">
                <Check className="h-4 w-4" />
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
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
