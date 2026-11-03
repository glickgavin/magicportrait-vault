"use client";

import { Download, Link2, MessageSquare, Share2 } from "lucide-react";
import { useState } from "react";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/BrandIcons";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

type Channel = "whatsapp" | "messages" | "facebook" | "instagram" | "native";

export function ShareActions({ cardId, publicId, shareUrl, toName, imageUrl, downloadUrl }: { cardId: string; publicId: string; shareUrl: string; toName: string; imageUrl: string; downloadUrl: string }) {
  const [note, setNote] = useState<string | null>(null);
  const text = t("builder.shareText", { name: toName });
  const shared = (channel: Channel) => trackClient("card_shared", { card_id: publicId, channel });

  async function fileFor(): Promise<File | null> {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      return new File([blob], "greeting-card.jpg", { type: "image/jpeg" });
    } catch {
      return null;
    }
  }
  async function nativeShare(channel: Channel = "native") {
    const file = await fileFor();
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (file && nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: text, text, url: shareUrl });
      else if (navigator.share) await navigator.share({ title: text, text, url: shareUrl });
      else {
        await copy();
        return;
      }
      shared(channel);
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
  const enc = encodeURIComponent;
  const apps: { channel: Channel; label: string; icon: React.ReactNode; href?: string; onClick?: () => void }[] = [
    { channel: "whatsapp", label: t("builder.whatsapp"), icon: <WhatsAppIcon size={22} color="#25D366" />, href: `https://wa.me/?text=${enc(`${text} ${shareUrl}`)}` },
    { channel: "messages", label: t("builder.messages"), icon: <MessageSquare className="h-[22px] w-[22px] text-[#34C759]" aria-hidden="true" />, href: `sms:?&body=${enc(`${text} ${shareUrl}`)}` },
    { channel: "facebook", label: t("builder.facebook"), icon: <FacebookIcon size={22} color="#1877F2" />, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}` },
    {
      channel: "instagram",
      label: t("builder.instagram"),
      icon: <InstagramIcon size={22} color="#DD2A7B" />,
      onClick: async () => {
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        const file = await fileFor();
        if (file && nav.canShare?.({ files: [file] })) return nativeShare("instagram");
        download();
        shared("instagram");
        setNote(t("builder.instagramTip"));
      },
    },
  ];

  return (
    <div data-card={cardId}>
      <button type="button" onClick={() => void nativeShare()} className="flex h-14 w-full items-center justify-center gap-2 rounded-[12px] bg-primary-gradient text-[17px] font-semibold text-white shadow-primary">
        <Share2 className="h-5 w-5" aria-hidden="true" /> {t("builder.share")}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={download} className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-black/[0.06] font-semibold" data-testid="download-card">
          <Download className="h-5 w-5" aria-hidden="true" /> {t("builder.download")}
        </button>
        <button type="button" onClick={() => void copy()} className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-black/[0.06] font-semibold" data-testid="copy-link">
          <Link2 className="h-5 w-5" aria-hidden="true" /> {t("builder.copyLink")}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] break-all text-center text-[14px] font-semibold text-success">
        {note}
      </p>
      <ul className="mt-2 grid grid-cols-4 gap-2">
        {apps.map((a) => (
          <li key={a.channel} className="text-center">
            {a.href ? (
              <a href={a.href} target="_blank" rel="noopener noreferrer" onClick={() => shared(a.channel)} className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm" aria-label={a.label}>
                {a.icon}
              </a>
            ) : (
              <button type="button" onClick={a.onClick} className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm" aria-label={a.label}>
                {a.icon}
              </button>
            )}
            <span className="mt-1 block text-[13px]" aria-hidden="true">
              {a.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
