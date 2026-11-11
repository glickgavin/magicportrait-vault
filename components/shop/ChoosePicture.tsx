"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import type { PictureView, ShopPage } from "@/lib/shop/pages";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

type Tab = "portraits" | "photos" | "upload";
type Upload = { name: string; pct: number; error: string | null; preview: string | null };

/** Choose a picture: Portraits, My photos (past uploads and photo tiles) and Upload (docs/shop.md). */
export function ChoosePicture({ page, product, tab: initialTab, portraits, photos, partial, maxMb, minPx }: { page: ShopPage; product: string | null; tab: Tab; portraits: PictureView[]; photos: PictureView[]; partial: boolean; maxMb: number; minPx: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<string | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const base = `/${page}`;
  const go = (id: string, kind: string) => {
    trackClient("shop_image_selected", { image_kind: kind, changed: false, page });
    router.push(`${base}/i/${id}${product ? `?product=${encodeURIComponent(product)}` : ""}`);
  };

  function send(file: File) {
    const preview = URL.createObjectURL(file);
    setUpload({ name: file.name, pct: 0, error: null, preview });
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/shop/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && setUpload((u) => (u ? { ...u, pct: Math.round((e.loaded / e.total) * 100) } : u));
    xhr.onload = () => {
      let body: { picture?: { id: string; kind: string }; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        /* */
      }
      if (xhr.status === 200 && body.picture) {
        setUpload((u) => (u ? { ...u, pct: 100 } : u));
        go(body.picture.id, body.picture.kind);
      } else {
        const known = ["too_small", "too_large", "not_an_image", "unsupported", "empty", "rate_limited"];
        const reason = xhr.status === 413 ? "too_large" : known.includes(body.error ?? "") ? (body.error as string) : "other";
        setUpload((u) => (u ? { ...u, error: t(`shop.uploadErrors.${reason}`, { mb: maxMb }) } : u));
      }
    };
    xhr.onerror = () => setUpload((u) => (u ? { ...u, error: t("shop.uploadErrors.other") } : u));
    xhr.send(fd);
  }

  const grid = (list: PictureView[], empty: string) =>
    list.length ? (
      <div role="radiogroup" aria-label={t(`shop.tabs.${tab}`)} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected === p.id}
            aria-label={`${t(`shop.tabs.${tab}`)} ${i + 1}${p.ordered ? `, ${t("shop.ordered")}` : ""}${p.small ? `, ${t("shop.small")}` : ""}`}
            onClick={() => setSelected(p.id)}
            onDoubleClick={() => go(p.id, p.kind)}
            className={cn("relative aspect-square overflow-hidden rounded-[12px] bg-black/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-magenta/40", selected === p.id && "ring-[3px] ring-magenta")}
          >
            {p.url && <img src={p.url} alt="" className="ph-no-capture h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
            {selected === p.id && (
              <span className="bg-avatar-gradient absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow-[0_0_0_2px_#fff]">
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} aria-hidden="true" />
              </span>
            )}
            {p.ordered && <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-pink-tint px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-pink-dark">{t("shop.ordered").toUpperCase()}</span>}
            {!p.ordered && p.kind === "photo_tile" && <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-white/90 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-ink">{t("shop.photoTile").toUpperCase()}</span>}
            {p.small && <span className="absolute bottom-1.5 right-1.5 rounded-[6px] bg-black/65 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">{t("shop.small").toUpperCase()}</span>}
          </button>
        ))}
      </div>
    ) : (
      <p className="rounded-[16px] bg-white p-4 text-[15px] text-ink-2">{empty}</p>
    );

  const chosen = [...portraits, ...photos].find((p) => p.id === selected);
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-4 pb-28">
      <Link href={base} className="-ml-2 flex h-11 w-fit items-center gap-1 px-2 text-[15px] font-bold text-ink">
        ‹ {t(page === "gifts" ? "shop.gifts" : "shop.products")}
      </Link>
      <div>
        <h1 className="text-[26px] font-extrabold leading-8">{t("shop.chooseTitle")}</h1>
        <p className="text-[15px] text-ink-2">{t(page === "gifts" ? "shop.chooseSubGifts" : "shop.chooseSubProducts")}</p>
      </div>
      {partial && <p role="status" className="rounded-[12px] bg-[#fff1d6] px-3 py-2 text-[14px] text-[#7a4a00]">{t("shop.partial")}</p>}
      <div role="tablist" aria-label={t("shop.chooseTitle")} className="grid grid-cols-3 gap-1 rounded-[12px] bg-black/[0.06] p-1">
        {(["portraits", "photos", "upload"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} id={`tab-${k}`} aria-controls={`panel-${k}`} onClick={() => setTab(k)} className={cn("h-10 rounded-[9px] text-[14px]", tab === k ? "bg-white font-bold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "font-semibold text-ink/70")}>
            {t(`shop.tabs.${k}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "portraits" && (
          <div className="flex flex-col gap-2">
            {portraits.length > 0 && <p className="text-[13px] font-semibold text-ink-2">{tn("shop.portraitsCount", portraits.length)}</p>}
            {grid(portraits, t("shop.noPortraits"))}
          </div>
        )}
        {tab === "photos" && (
          <div className="flex flex-col gap-2">
            {grid(photos, t("shop.noPhotos"))}
            {photos.some((p) => p.small) && <p className="text-[13px] text-ink-2">{t("shop.smallNote")}</p>}
          </div>
        )}
        {tab === "upload" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed border-[#B8059F]/35 bg-white p-5 text-center">
              <span className="flex h-13 w-13 items-center justify-center rounded-full bg-pink-tint p-3">
                <Upload className="h-6 w-6 text-pink-link" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[16px] font-extrabold">{t("shop.uploadTitle")}</p>
                <p className="text-[13px] leading-5 text-ink-2">{t("shop.uploadRules", { mb: maxMb, px: minPx })}</p>
              </div>
              <div className="grid w-full max-w-[420px] grid-cols-2 gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="bg-primary-gradient shadow-primary h-12 rounded-[12px] text-[15px] font-extrabold text-white">
                  {t("shop.choosePhoto")}
                </button>
                <button type="button" onClick={() => cameraRef.current?.click()} className="h-12 rounded-[12px] border border-[#B8059F]/35 bg-white text-[15px] font-bold text-pink-dark">
                  {t("shop.takePhoto")}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" aria-label={t("shop.choosePhoto")} onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t("shop.takePhoto")} onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
            </div>
            {upload && (
              <div role={upload.error ? "alert" : "status"} className={cn("flex items-center gap-3 rounded-[16px] p-2.5", upload.error ? "border border-[#c42b1c]/25 bg-[#fff4f2]" : "bg-white")}>
                {upload.preview && <img src={upload.preview} alt="" className="h-13 w-13 flex-none rounded-[10px] object-cover" style={{ width: 52, height: 52, opacity: upload.error ? 0.6 : 1 }} />}
                <div className="min-w-0 flex-1">
                  {upload.error ? (
                    <p className="text-[14px] font-bold text-[#a3271a]">{upload.error}</p>
                  ) : (
                    <>
                      <div className="flex justify-between text-[14px]">
                        <span className="font-bold">{t("shop.uploading")}</span>
                        <span className="text-ink-2">{upload.pct}%</span>
                      </div>
                      <div role="progressbar" aria-valuenow={upload.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("shop.uploading")} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div className="bg-primary-gradient h-full rounded-full" style={{ width: `${upload.pct}%` }} />
                      </div>
                    </>
                  )}
                </div>
                <button type="button" aria-label={t("shop.close")} onClick={() => setUpload(null)} className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px]">
                  <X className="h-4 w-4 text-ink-2" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {tab !== "upload" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 pb-7 pt-3">
          <div className="mx-auto max-w-[960px]">
            <button type="button" disabled={!chosen} onClick={() => chosen && go(chosen.id, chosen.kind)} className={cn("h-13 w-full rounded-[12px] py-3.5 text-[16px] font-extrabold", chosen ? "bg-primary-gradient shadow-primary text-white" : "bg-black/[0.08] text-ink/45")}>
              {t(page === "gifts" ? "shop.seeGiftIdeas" : "shop.seeProductIdeas")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
