"use client";

import { Download, MoreHorizontal, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocalDateTime } from "@/components/LocalDateTime";
import { EMPTY_DRAFT, type Draft } from "@/components/builder/types";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

export type MyCard = {
  id: string;
  publicId: string;
  toName: string;
  fromName: string;
  message: string;
  versionId: string | null;
  versionName: string;
  imageId: string | null;
  crop: { zoom: number; x: number; y: number } | null;
  delivery: "email" | "self";
  recipientEmail: string | null;
  status: string;
  label: "emailed" | "opened" | "scheduled" | "shared" | "downloaded" | "failed" | "ready" | "cancelled" | "rendering";
  date: string;
  scheduledFor: string | null;
  createdAt: string;
};

const BADGE: Record<MyCard["label"], string> = {
  emailed: "bg-[#e3f4e8] text-[#1f6b35]",
  opened: "bg-[#e3f4e8] text-[#1f6b35]",
  scheduled: "bg-pink-tint text-pink-dark",
  shared: "bg-black/[0.06] text-ink",
  downloaded: "bg-black/[0.06] text-ink",
  ready: "bg-black/[0.06] text-ink",
  failed: "bg-[#fde8e6] text-[#a1251b]",
  cancelled: "bg-black/[0.06] text-ink-2",
  rendering: "bg-black/[0.06] text-ink-2",
};

function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem("vault.card.draft.v1", JSON.stringify(d));
  } catch {
    /* */
  }
}
const localInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function MyCardsList({ cards }: { cards: MyCard[] }) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function reuse(c: MyCard) {
    trackClient("card_reused", { card_id: c.publicId });
    saveDraft({ ...EMPTY_DRAFT, versionId: c.versionId, imageId: c.imageId, crop: c.crop ?? EMPTY_DRAFT.crop, from: c.fromName, message: c.message, messageTouched: true, reusedFrom: c.id, entryPoint: "use_again", flow: "full" });
    router.push(c.versionId && c.imageId ? `/create/message?v=${c.versionId}&image=${c.imageId}` : "/create?step=theme&entry=use_again");
  }
  function change(c: MyCard) {
    saveDraft({
      ...EMPTY_DRAFT,
      versionId: c.versionId,
      imageId: c.imageId,
      crop: c.crop ?? EMPTY_DRAFT.crop,
      to: c.toName,
      from: c.fromName,
      message: c.message,
      messageTouched: true,
      delivery: "email",
      recipientEmail: c.recipientEmail ?? "",
      when: "later",
      scheduledLocal: c.scheduledFor ? localInput(c.scheduledFor) : "",
      editingCardId: c.id,
      flow: "full",
    });
    router.push(`/create/message?v=${c.versionId}&image=${c.imageId}&edit=${c.id}`);
  }
  async function post(c: MyCard, action: "resend" | "cancel") {
    setMenu(null);
    if (action === "cancel" && !window.confirm(t("myCards.cancelConfirm", { name: c.toName }))) return;
    const r = await fetch(`/api/cards/${c.id}/${action}`, { method: "POST" });
    setNote(r.ok ? t(action === "resend" ? "myCards.resent" : "myCards.cancelled") : t("errors.generic"));
    if (r.ok) router.refresh();
  }

  return (
    <>
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-[15px] font-semibold text-success">
        {note}
      </p>
      <ul className="flex flex-col gap-4">
        {cards.map((c) => (
          <li key={c.id} className="flex gap-4 rounded-[20px] bg-white p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="my-card">
            <Link href={`/cards/${c.publicId}`} className="shrink-0">
              <img src={`/api/cards/${c.id}/image?size=thumb`} alt={t("builder.cardAlt", { name: c.toName })} width={104} height={146} loading="lazy" className="ph-no-capture h-[146px] w-[104px] rounded-[6px] bg-[#F5F1E6] object-cover" />
            </Link>
            <div className="min-w-0 flex-1">
              <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[13px] font-bold", BADGE[c.label])}>
                {t(`myCards.badge.${c.label}`)}
              </span>
              <h2 className="mt-1 truncate text-[18px] font-bold" data-ph-mask>
                {t("myCards.for", { name: c.toName })}
              </h2>
              <p className="text-[14px] text-ink-2">
                {c.versionName} · {c.label === "scheduled" && c.scheduledFor ? <LocalDateTime iso={c.scheduledFor} /> : c.date}
              </p>
              <div className="relative mt-2 flex gap-2">
                <Link href={`/cards/${c.publicId}`} aria-label={t("myCards.share", { name: c.toName })} className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05]">
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                </Link>
                <a
                  href={`/api/cards/${c.id}/image?download=1`}
                  onClick={() => trackClient("card_downloaded", { card_id: c.publicId })}
                  aria-label={t("myCards.download", { name: c.toName })}
                  className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05]"
                >
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
                {c.label === "scheduled" ? (
                  <button type="button" onClick={() => setMenu(menu === c.id ? null : c.id)} aria-expanded={menu === c.id} aria-label={t("myCards.more", { name: c.toName })} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-[12px] bg-black/[0.05] font-semibold">
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" /> {t("myCards.manage")}
                  </button>
                ) : (
                  <button type="button" onClick={() => reuse(c)} className="h-11 flex-1 rounded-[12px] bg-black/[0.05] font-semibold">
                    {t("myCards.useAgain")}
                  </button>
                )}
                {menu === c.id && (
                  <div role="menu" className="absolute right-0 top-12 z-20 w-48 rounded-[14px] bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                    <button role="menuitem" type="button" className="block w-full rounded-[10px] px-3 py-2.5 text-left font-semibold hover:bg-black/[0.04]" onClick={() => change(c)}>
                      {t("myCards.change")}
                    </button>
                    <button role="menuitem" type="button" className="block w-full rounded-[10px] px-3 py-2.5 text-left font-semibold text-danger hover:bg-black/[0.04]" onClick={() => void post(c, "cancel")}>
                      {t("myCards.cancel")}
                    </button>
                    <button role="menuitem" type="button" className="block w-full rounded-[10px] px-3 py-2.5 text-left font-semibold hover:bg-black/[0.04]" onClick={() => reuse(c)}>
                      {t("myCards.useAgain")}
                    </button>
                  </div>
                )}
              </div>
              {(c.label === "emailed" || c.label === "opened" || (c.label === "failed" && c.delivery === "email")) && (
                <button type="button" onClick={() => void post(c, "resend")} className="link mt-2 text-[14px]">
                  {t("myCards.resend")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
