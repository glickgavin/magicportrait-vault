"use client";

import { Download, Link2, Send, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { maskEmail } from "@/lib/utils";

const SEND_ERRORS: Record<string, string> = {
  invalid_email: "builder.errorEmail",
  suppressed: "builder.errorSuppressed",
  already_sent: "builder.errorAlreadySent",
  rate_limited: "errors.rateLimited",
  paused: "builder.paused",
};

/**
 * The ready screen (4 Nov review): Send by email at once (one recipient per card), Share (the phone's
 * share sheet; "Copy link" where there's none) and Download. No app buttons.
 */
export function ReadyActions({
  cardId,
  publicId,
  toName,
  shareUrl,
  imageUrl,
  downloadUrl,
  sentTo,
  canSend,
}: {
  cardId: string;
  publicId: string;
  toName: string;
  shareUrl: string;
  imageUrl: string;
  downloadUrl: string;
  sentTo: string | null;
  canSend: boolean;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(sentTo);
  const [busy, setBusy] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  async function send(address: string) {
    setBusy(true);
    setSendNote(null);
    trackClient("card_delivery_selected", { delivery: "email" });
    const res = await fetch(`/api/cards/${cardId}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address }) }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; resent?: boolean } | undefined;
    setBusy(false);
    if (res?.ok) {
      const masked = maskEmail(address.trim().toLowerCase());
      setSent(masked);
      setEmail("");
      setSendNote({ ok: true, text: body?.resent ? t("builder.resent") : t("builder.sentTo", { email: masked }) });
      return;
    }
    setSendNote({ ok: false, text: t(SEND_ERRORS[body?.error ?? ""] ?? "builder.errorSendFailed") });
  }

  async function resend() {
    setBusy(true);
    setSendNote(null);
    const res = await fetch(`/api/cards/${cardId}/resend`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    setSendNote(res?.ok ? { ok: true, text: t("builder.resent") } : { ok: false, text: t(SEND_ERRORS[body?.error ?? ""] ?? "builder.errorSendFailed") });
  }

  async function share() {
    const text = t("builder.shareText", { name: toName });
    let file: File | null = null;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      file = new File([blob], "greeting-card.jpg", { type: "image/jpeg" });
    } catch {
      file = null;
    }
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      // Some apps drop a bare URL when a file is attached, so the link also goes in the text.
      if (file && nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: text, text: `${text} ${shareUrl}` });
      else await navigator.share({ title: text, text, url: shareUrl });
      trackClient("card_shared", { card_id: publicId, channel: "native" });
    } catch {
      /* cancelled */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNote(t("builder.copied"));
      trackClient("card_link_copied", { card_id: publicId });
    } catch {
      setNote(shareUrl);
    }
  }
  function download() {
    trackClient("card_downloaded", { card_id: publicId });
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex flex-col gap-3">
      {canSend && (
        <div className="rounded-[18px] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="send-box">
          {sent ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[16px] font-bold" data-ph-mask>
                {t("builder.sentTo", { email: sent })}
              </p>
              <button type="button" onClick={() => void resend()} disabled={busy} className="min-h-[44px] shrink-0 rounded-[12px] bg-black/[0.06] px-4 font-semibold disabled:opacity-50" data-testid="resend">
                {t("builder.resend")}
              </button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && email.trim()) void send(email);
              }}
            >
              <label htmlFor="send-email" className="block text-[16px] font-bold">
                {t("builder.sendTitle", { name: toName })}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="send-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("builder.recipientPlaceholder")}
                  aria-label={t("builder.recipientLabel")}
                  aria-describedby="send-note"
                  className="ph-no-capture h-12 min-w-0 flex-1 rounded-[12px] border border-black/15 bg-[#F8F6F0] px-3 text-[16px]"
                  data-ph-mask
                />
                <Button type="submit" size="lg" className="h-12 shrink-0 px-5" disabled={busy || !email.trim()} data-testid="send-card">
                  <Send className="h-4 w-4" aria-hidden="true" /> {busy ? t("builder.sendingNow") : t("builder.send")}
                </Button>
              </div>
            </form>
          )}
          <p id="send-note" role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-[14px] font-semibold ${sendNote?.ok ? "text-success" : "text-danger"}`}>
            {sendNote?.text}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {canNativeShare ? (
          <button type="button" onClick={() => void share()} className="flex h-14 items-center justify-center gap-2 rounded-[12px] bg-primary-gradient text-[17px] font-semibold text-white shadow-primary" data-testid="share-card">
            <Share2 className="h-5 w-5" aria-hidden="true" /> {t("builder.share")}
          </button>
        ) : (
          <button type="button" onClick={() => void copy()} className="flex h-14 items-center justify-center gap-2 rounded-[12px] bg-primary-gradient text-[17px] font-semibold text-white shadow-primary" data-testid="copy-link">
            <Link2 className="h-5 w-5" aria-hidden="true" /> {t("builder.copyLink")}
          </button>
        )}
        <button type="button" onClick={download} className="flex h-14 items-center justify-center gap-2 rounded-[12px] bg-black/[0.06] text-[17px] font-semibold" data-testid="download-card">
          <Download className="h-5 w-5" aria-hidden="true" /> {t("builder.download")}
        </button>
      </div>
      <p role="status" aria-live="polite" className="min-h-[1.25rem] break-all text-center text-[14px] font-semibold text-success">
        {note}
      </p>
    </div>
  );
}
