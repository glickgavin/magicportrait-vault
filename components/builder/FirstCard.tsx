"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Image as ImageIcon, LayoutGrid, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CardPreview } from "@/components/CardPreview";
import { StickyFooterBar } from "./StepHeader";
import { useDraft } from "./useDraft";
import { submitCard } from "./submit";
import type { BuilderData } from "./types";
import { usableIdeas } from "@/lib/render/layout";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

/** The first card on one screen (SPEC §8.0): the card is already made; they type who it's for and tap Create. */
export function FirstCard({ data, entryPoint }: { data: BuilderData; entryPoint: string | null }) {
  const router = useRouter();
  const { draft, update, ready } = useDraft((d) => ({
    ...d,
    flow: "first",
    entryPoint: entryPoint ?? d.entryPoint,
    versionId: d.versionId && data.versions.some((v) => v.id === d.versionId) ? d.versionId : data.defaults.versionId,
    imageId: d.imageId && data.sessions.some((s) => s.portraits.some((p) => p.imageId === d.imageId)) ? d.imageId : data.defaults.imageId,
    from: d.from || data.firstName,
    when: "now",
  }));
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [editingFrom, setEditingFrom] = useState(false);
  const [sheet, setSheet] = useState<null | "design" | "photo">(null);
  const [cycled, setCycled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const version = data.versions.find((v) => v.id === draft.versionId) ?? data.versions[0] ?? null;
  const portrait = data.sessions.flatMap((s) => s.portraits).find((p) => p.imageId === draft.imageId) ?? null;
  const session = data.sessions.find((s) => s.sessionId === portrait?.sessionId);
  const ideas = useMemo(() => (version ? usableIdeas(version.messageIdeas, session?.petName) : []), [version, session?.petName]);
  const cycle = useMemo(() => {
    const inSeason = data.versions.filter((v) => v.inSeason);
    return inSeason.length > 1 ? inSeason : data.versions;
  }, [data.versions]);

  useEffect(() => {
    if (!ready || !version) return;
    trackClient("page_view_card_first", { theme_slug: version.fullSlug, version_slug: version.versionSlug, portrait_was_ordered: Boolean(portrait?.ordered), pet_name_known: Boolean(session?.petName), entry_point: draft.entryPoint });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (ready && !draft.messageTouched && ideas.length) update({ message: ideas[Math.min(ideaIndex, ideas.length - 1)] });
  }, [ready, ideas, ideaIndex, draft.messageTouched, update]);

  if (!version) return null;
  const canCreate = Boolean(draft.to.trim()) && Boolean(draft.from.trim()) && !busy;
  const max = version.messageMaxChars ?? data.maxChars;

  function setVersion(id: string, via: "cycle" | "picker") {
    const v = data.versions.find((x) => x.id === id);
    if (!v) return;
    update({ versionId: id, messageTouched: false });
    setIdeaIndex(0);
    trackClient("card_first_design_changed", { to_version_slug: v.fullSlug, via });
  }
  function onChangeDesign() {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (!cycled && cycle.length > 1) {
      const i = cycle.findIndex((v) => v.id === version!.id);
      setVersion(cycle[(i + 1) % cycle.length].id, "cycle");
      setCycled(true);
    } else setSheet("design");
  }

  async function create() {
    setBusy(true);
    setError(null);
    // Created first, sent from the ready screen (4 Nov review).
    const r = await submitCard({ ...draft, delivery: "self", recipientEmail: "", flow: "first", when: "now", scheduledLocal: "" }, version!.fullSlug);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }
    router.push(`/create/creating/${r.id}?first=1`);
  }

  return (
    <div className="mx-auto max-w-[520px] pb-36" data-testid="first-card">
      <div className="text-center">
        <span className="rounded-full bg-pink-tint px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide text-pink-dark">{t("builder.yourFreeGift")}</span>
        <h1 className="mt-3 text-[28px] font-extrabold tracking-tight">{t("builder.madeYouACard")}</h1>
        <p className="text-[16px] text-ink-2">{t("builder.madeYouACardBody")}</p>
      </div>
      <div className="mx-auto mt-4 w-[52%] max-w-[260px]">
        <CardPreview
          layout={version.layout}
          backgroundUrl={version.backgroundUrl}
          overlayUrl={version.overlayUrl}
          portraitUrl={portrait?.imageUrl}
          crop={draft.crop}
          photoBg={version.photoBg}
          to={draft.to || t("home.theirName")}
          from={draft.from}
          message={draft.message}
          footerText={data.footerText}
          label={t("builder.livePreview")}
          priority
        />
      </div>
      <div className="mt-4 flex justify-center gap-3">
        <button
          type="button"
          onClick={onChangeDesign}
          onPointerDown={() => {
            pressTimer.current = setTimeout(() => {
              longPressed.current = true;
              setSheet("design");
            }, 550);
          }}
          onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-[15px] font-semibold"
        >
          <LayoutGrid className="h-4 w-4 text-magenta" aria-hidden="true" /> {t("builder.changeDesign")}
        </button>
        <button type="button" onClick={() => setSheet("photo")} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-[15px] font-semibold">
          <ImageIcon className="h-4 w-4 text-magenta" aria-hidden="true" /> {t("builder.changePhoto")}
        </button>
      </div>
      <p className="mt-2 text-center text-[14px] text-ink-2" aria-live="polite">
        {t(version.inSeason ? "builder.designNoteSeason" : "builder.designNote", { theme: version.themeName, name: version.name })}
      </p>

      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) void create();
        }}
      >
        <div className="rounded-[20px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
          <label htmlFor="first-to" className="block text-[17px] font-bold">
            {t("builder.whoFor")}
          </label>
          <input
            id="first-to"
            value={draft.to}
            maxLength={60}
            autoComplete="off"
            placeholder={t("builder.toPlaceholder")}
            onChange={(e) => update({ to: e.target.value })}
            className="mt-2 h-[52px] w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-4 text-[17px]"
          />
          <div className="mt-4 flex items-baseline justify-between">
            <label htmlFor="first-message" className="text-[17px] font-bold">
              {t("builder.message")}
            </label>
            {ideas.length > 1 && (
              <button
                type="button"
                className="text-[15px] font-bold text-pink-link"
                onClick={() => {
                  const next = (ideaIndex + 1) % ideas.length;
                  setIdeaIndex(next);
                  update({ message: ideas[next], messageTouched: false });
                  trackClient("card_first_idea_changed", { idea_index: next });
                }}
              >
                {t("builder.tryAnother")}
              </button>
            )}
          </div>
          <textarea
            id="first-message"
            rows={3}
            value={draft.message}
            maxLength={max}
            onChange={(e) => update({ message: e.target.value, messageTouched: true })}
            className="mt-2 w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 py-2.5 text-[16px] leading-snug"
          />
          <div className="mt-2 text-[14px] text-ink-2">
            {editingFrom ? (
              <span className="flex items-center gap-2">
                <label htmlFor="first-from">{t("builder.fromName")}</label>
                <input id="first-from" value={draft.from} maxLength={60} onChange={(e) => update({ from: e.target.value })} className="h-9 flex-1 rounded-[10px] border border-black/15 bg-[#F8F6F0] px-2 text-[15px]" />
                <button type="button" className="font-bold text-pink-link" onClick={() => setEditingFrom(false)}>
                  {t("builder.done")}
                </button>
              </span>
            ) : (
              <>
                {t("builder.fromLine", { name: draft.from || "…" })} ·{" "}
                <button type="button" className="font-bold text-pink-link underline" onClick={() => setEditingFrom(true)} aria-label={`${t("builder.change")} ${t("builder.fromName")}`}>
                  {t("builder.change")}
                </button>
              </>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-[15px] font-semibold text-danger">
            {error}
          </p>
        )}
        <StickyFooterBar>
          <div className="w-full">
            <Button type="submit" size="lg" className="w-full" disabled={!canCreate} data-testid="create-card">
              {t("builder.createMyCard")} <Sparkles className="h-4 w-4" aria-hidden="true" />
            </Button>
            <button
              type="button"
              className="link mx-auto mt-2 block text-[15px]"
              onClick={() => {
                trackClient("card_first_full_builder_opened", {});
                update({ flow: "full" });
                router.push("/create?step=theme");
              }}
            >
              {t("builder.seeAllDesigns")}
            </button>
          </div>
        </StickyFooterBar>
      </form>

      <Sheet open={sheet === "design"} onClose={() => setSheet(null)} title={t("builder.pickDesign")}>
        <div role="radiogroup" aria-label={t("builder.pickDesign")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === version.id}
              aria-label={`${v.themeName} · ${v.name}`}
              onClick={() => {
                setVersion(v.id, "picker");
                setSheet(null);
              }}
              className={cn("relative rounded-[14px] bg-white p-1.5 text-left", v.id === version.id && "ring-[3px] ring-magenta")}
            >
              <img src={v.thumbnailUrl ?? v.backgroundUrl} alt="" className="aspect-[5/7] w-full rounded-[8px] object-cover" loading="lazy" />
              <span className="mt-1 block truncate px-1 text-[14px] font-semibold">{v.name}</span>
              {v.id === version.id && <SelectedTick />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === "photo"} onClose={() => setSheet(null)} title={t("builder.pickPhoto")}>
        {data.sessions.map((s) => (
          <div key={s.sessionId} className="mb-4">
            <p className="mb-2 text-[15px] font-bold">{[s.themeName, s.petName].filter(Boolean).join(" · ")}</p>
            <div role="radiogroup" aria-label={[s.themeName, s.petName].filter(Boolean).join(" · ")} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {s.portraits.map((p, i) => (
                <button
                  key={p.imageId}
                  type="button"
                  role="radio"
                  aria-checked={p.imageId === draft.imageId}
                  aria-label={t("builder.portraitN", { theme: s.themeName ?? "", n: i + 1 })}
                  onClick={() => {
                    update({ imageId: p.imageId, crop: { zoom: 1, x: 0, y: 0 }, messageTouched: false });
                    trackClient("card_first_photo_changed", { image_id: p.imageId, was_ordered: p.ordered });
                    setSheet(null);
                  }}
                  className={cn("relative aspect-square overflow-hidden rounded-[12px]", p.imageId === draft.imageId && "ring-[3px] ring-magenta")}
                >
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {p.imageId === draft.imageId && <SelectedTick />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </div>
  );
}

function SelectedTick() {
  return (
    <span className="bg-avatar-gradient absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white" aria-hidden="true">
      <Check className="h-4 w-4" />
    </span>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content aria-describedby={undefined} className="animate-sheet-bottom fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[24px] bg-sheet p-4 pb-safe sm:mx-auto sm:max-w-[640px]">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[19px] font-extrabold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label={t("builder.close")} className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/5">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
