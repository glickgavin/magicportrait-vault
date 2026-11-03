"use client";

import { Crown, MessageCircleQuestion } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/BrandIcons";
import { t } from "@/lib/i18n";
import { openChat, openShopifyLogin } from "@/lib/intercom";
import { mainSite } from "@/lib/site-links";

const muted = { color: "rgba(0,0,0,0.6)" };
const strong = { color: "rgba(0,0,0,0.8)" };
const pink = "#dd07c4";
const pill = "flex w-fit items-center gap-2 rounded-[12px] px-4 py-2 text-[14px] hover:opacity-70";

/** The live site's footer, unchanged (reference/live-site/src/components/Footer.tsx). */
export function Footer({ mainSiteUrl }: { mainSiteUrl: string }) {
  const link = (p: string) => mainSite(mainSiteUrl, p);
  return (
    <footer className="mt-16 w-full rounded-tl-[32px] rounded-tr-[32px] px-6 pb-5 pt-10" style={{ backgroundColor: "rgba(0,0,0,0.05)" }}>
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-0">
          <div className="col-span-2 md:col-span-1 md:pr-4">
            <img src="/mp-logo.svg" alt={t("app.logoAlt")} className="h-8 w-auto" />
          </div>
          <div className="order-1 flex flex-col gap-3 md:order-2 md:pl-4">
            <span className="text-[16px] font-bold" style={strong}>
              {t("ui.footer.products")}
            </span>
            {(
              [
                ["/start", "ui.footer.petPortraits"],
                ["/masterpiece", "ui.footer.masterpiece"],
                ["/humans", "ui.footer.familyPortraits"],
                ["/photo-tiles", "ui.footer.photoTiles"],
                ["/photo-books", "ui.footer.photoBooks"],
              ] as const
            ).map(([p, k]) => (
              <a key={p} href={link(p)} className="text-[14px] hover:opacity-70" style={muted}>
                {t(k)}
              </a>
            ))}
            <div className="my-1 flex items-center gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
              ))}
            </div>
            <a href={link("/terms")} className="text-[14px] hover:opacity-70" style={muted}>
              {t("ui.footer.terms")}
            </a>
            <a href={link("/privacy")} className="text-[14px] hover:opacity-70" style={muted}>
              {t("ui.footer.privacy")}
            </a>
            <a href={link("/faq")} className="text-[14px] hover:opacity-70" style={muted}>
              {t("ui.footer.faq")}
            </a>
          </div>
          <div className="order-2 flex flex-col gap-3 md:order-1 md:pl-4">
            <button type="button" onClick={openChat} className={pill} style={{ backgroundColor: "rgba(0,0,0,0.05)", ...strong }}>
              <MessageCircleQuestion className="h-4 w-4" style={{ color: pink }} aria-hidden="true" />
              {t("ui.footer.chat")}
            </button>
            <button type="button" onClick={() => openShopifyLogin()} className={pill} style={{ backgroundColor: "rgba(0,0,0,0.05)", ...strong }}>
              <Crown className="h-4 w-4" style={{ color: pink }} aria-hidden="true" />
              {t("ui.footer.vip")}
            </button>
            <a href={link("/about")} className="mt-1 text-[14px] hover:opacity-70" style={muted}>
              {t("ui.footer.about")}
            </a>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[14px]" style={muted}>
                {t("ui.footer.followUs")}
              </span>
              <a href="https://www.instagram.com/storyboardsphotos/" target="_blank" rel="noopener noreferrer" aria-label={t("ui.footer.instagram")} className="hover:opacity-70">
                <InstagramIcon size={20} color={pink} />
              </a>
              <a href="https://www.facebook.com/storyboardsbot" target="_blank" rel="noopener noreferrer" aria-label={t("ui.footer.facebook")} className="hover:opacity-70">
                <FacebookIcon size={20} color={pink} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
