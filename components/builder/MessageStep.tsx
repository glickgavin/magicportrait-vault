"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardPreview } from "@/components/CardPreview";
import { StepHeader, StickyFooterBar } from "./StepHeader";
import { DeliveryFields } from "./DeliveryFields";
import { useDraft } from "./useDraft";
import { submitCard } from "./submit";
import type { BuilderData } from "./types";
import { usableIdeas } from "@/lib/render/layout";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

export function MessageStep({ data, versionId, imageId, editCardId }: { data: BuilderData; versionId: string | null; imageId: string | null; editCardId?: string | null }) {
  const router = useRouter();
  const { draft, update, ready } = useDraft((d) => ({ ...d, versionId: versionId ?? d.versionId, imageId: imageId ?? d.imageId, from: d.from || data.firstName }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = data.versions.find((v) => v.id === draft.versionId) ?? null;
  const portrait = data.sessions.flatMap((s) => s.portraits).find((p) => p.imageId === draft.imageId) ?? null;
  const session = data.sessions.find((s) => s.sessionId === portrait?.sessionId);
  const ideas = useMemo(() => (version ? usableIdeas(version.messageIdeas, session?.petName, draft.to) : []), [version, session?.petName, draft.to]);
  const max = version?.messageMaxChars ?? data.maxChars;

  useEffect(() => {
    trackClient("page_view_card_message", {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!version) router.replace("/create?step=theme");
    else if (!portrait) router.replace(`/create/portrait?v=${version.id}`);
    else if (!draft.messageTouched && !draft.message && ideas[0]) update({ message: ideas[0] });
  }, [ready, version, portrait, draft.messageTouched, draft.message, ideas, router, update]);
  if (!version || !portrait) return null;

  const canSubmit = draft.to.trim() && draft.from.trim() && draft.message.length <= max && (draft.delivery === "self" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.recipientEmail.trim())) && (draft.when === "now" || draft.delivery === "self" || draft.scheduledLocal);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await submitCard({ ...draft, flow: "full" }, version!.fullSlug, editCardId ? { method: "PATCH", url: `/api/cards/${editCardId}` } : {});
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }
    router.push(`/create/creating/${r.id}${r.firstCard ? "?first=1" : ""}`);
  }

  return (
    <div className="mx-auto max-w-[960px] pb-28 lg:grid lg:grid-cols-[1fr_420px] lg:gap-8" data-testid="step-message">
      <div className="lg:col-span-2">
        <StepHeader step={3} onBack={() => router.push(`/create/portrait?v=${version.id}&image=${portrait.imageId}`)} />
      </div>
      <div className="mx-auto mt-5 w-[60%] max-w-[300px] lg:order-2 lg:w-full">
        <div className="lg:sticky lg:top-20">
          <CardPreview
            layout={version.layout}
            backgroundUrl={version.backgroundUrl}
            overlayUrl={version.overlayUrl}
            portraitUrl={portrait.imageUrl}
            crop={draft.crop}
            photoBg={version.photoBg}
            to={draft.to || t("home.theirName")}
            from={draft.from}
            message={draft.message}
            footerText={data.footerText}
            label={t("builder.livePreview")}
          />
          <p className="mt-2 text-center text-[14px] text-ink-2">{t("builder.livePreview")}</p>
        </div>
      </div>
      <form
        className="mt-5 flex flex-col gap-4 lg:order-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy) void create();
        }}
      >
        <div className="rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="card-to" className="block text-[15px] font-bold">
                {t("builder.to")}
              </label>
              <input id="card-to" value={draft.to} maxLength={60} onChange={(e) => update({ to: e.target.value })} autoComplete="off" className="mt-1 h-12 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 text-[16px]" />
            </div>
            <div>
              <label htmlFor="card-from" className="block text-[15px] font-bold">
                {t("builder.from")}
              </label>
              <input id="card-from" value={draft.from} maxLength={60} onChange={(e) => update({ from: e.target.value })} autoComplete="given-name" className="mt-1 h-12 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 text-[16px]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between">
              <label htmlFor="card-message" className="block text-[15px] font-bold">
                {t("builder.message")}
              </label>
              <span id="card-message-count" className={`text-[14px] ${draft.message.length > max ? "font-bold text-danger" : "text-ink-2"}`} aria-live="polite">
                {t("builder.counter", { n: draft.message.length, max })}
              </span>
            </div>
            <textarea
              id="card-message"
              rows={3}
              value={draft.message}
              aria-describedby="card-message-count"
              onChange={(e) => update({ message: e.target.value, messageTouched: true })}
              className="mt-1 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 py-2.5 text-[16px] leading-snug"
            />
          </div>
          {ideas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("builder.ideasLabel")}>
              {ideas.map((idea, i) => (
                <button
                  key={i}
                  type="button"
                  title={idea}
                  onClick={() => {
                    update({ message: idea, messageTouched: true });
                    trackClient("card_message_idea_used", { idea: i });
                  }}
                  className="rounded-full bg-pink-tint px-4 py-2 text-[14px] font-bold text-pink-dark"
                >
                  {t("builder.idea", { n: i + 1 })}
                </button>
              ))}
            </div>
          )}
        </div>
        <DeliveryFields draft={draft} update={update} allowSchedule scheduleMaxDays={data.scheduleMaxDays} />
        {error && (
          <p role="alert" className="text-[15px] font-semibold text-danger">
            {error}
          </p>
        )}
        <StickyFooterBar>
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || busy} data-testid="create-card">
            {editCardId ? t("builder.saveChanges") : t("builder.createMyCard")} <Sparkles className="h-4 w-4" aria-hidden="true" />
          </Button>
        </StickyFooterBar>
      </form>
    </div>
  );
}
