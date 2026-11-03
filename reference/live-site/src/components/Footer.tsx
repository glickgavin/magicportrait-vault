import { Facebook, Instagram, MessageCircleQuestion, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "@/components/LocalizedLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import mpLogo from "@/assets/MP-Logo-2.svg";
import { openShopifyLogin } from "@/lib/shopifyLogin";

export const Footer = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const textMuted = { color: 'rgba(0,0,0,0.5)' };
  const textStrong = { color: 'rgba(0,0,0,0.8)' };
  const iconPink = '#dd07c4';

  return (
    <footer
      className="w-full pt-10 pb-5 px-6 rounded-tl-[32px] rounded-tr-[32px]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0">
          {/* Logo — full width on mobile, first col on desktop */}
          <div className="col-span-2 md:col-span-1 md:order-0 md:pr-4">
            <img src={mpLogo} alt="Magic Portraits AI" className="h-8" />
          </div>

          {/* Products + Legal — left column on mobile, third col on desktop */}
          <div className="flex flex-col gap-3 order-1 md:order-2 md:pl-4">
            {!compact && (
            <>
            <span className="font-bold" style={{ fontSize: '16px', ...textStrong }}>
              {t('ui.footer.products')}
            </span>
            {/*
              PREVIOUS LINK INVENTORY (pre-SPA migration).
              Restore these three entries verbatim if a rollback is
              needed. Other footer sections (Legal, Actions, Social,
              Logo, About Us) were unchanged in this migration.
                1. "Magic Portraits AI" external <a> href="https://magicportraits.ai/"
                2. "Photo Tiles"        external <a> href="https://shop.magicportraits.ai/upload"
                3. "Albums"             external <a> href="https://storybooks.storyboards.io/"
            */}
            <LocalizedLink to="/start" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.petPortraits')}
            </LocalizedLink>
            <LocalizedLink to="/masterpiece" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.masterpiece')}
            </LocalizedLink>
            <LocalizedLink to="/humans" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.familyPortraits')}
            </LocalizedLink>
            <LocalizedLink to="/photo-tiles" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.photoTiles')}
            </LocalizedLink>
            <LocalizedLink to="/photo-books" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.photoBooks')}
            </LocalizedLink>
            {/* Dot separator */}
            <div className="flex items-center gap-2 my-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
            </div>
            </>
            )}
            <Link to="/terms" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.terms')}
            </Link>
            <Link to="/privacy" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.privacy')}
            </Link>
            <LocalizedLink to="/faq" className="hover:opacity-70 transition-opacity" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.faq')}
            </LocalizedLink>
          </div>

          {/* Actions & Social — right column on mobile, second col on desktop */}
          <div className="flex flex-col gap-3 order-2 md:order-1 md:pl-4">
            <button onClick={() => (window as any).Intercom?.('show')} className="flex items-center gap-2 px-4 py-2 hover:opacity-70 transition-opacity w-fit" style={{ fontSize: '14px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '12px', ...textStrong }}>
              <MessageCircleQuestion className="w-4 h-4" style={{ color: iconPink }} />
              {t('ui.footer.chat')}
            </button>
            {!compact && (
            <>
            <button
              onClick={() => openShopifyLogin()}
              className="flex items-center gap-2 px-4 py-2 hover:opacity-70 transition-opacity w-fit"
              style={{ fontSize: '14px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '12px', ...textStrong }}
            >
              <Crown className="w-4 h-4" style={{ color: iconPink }} />
              {t('ui.footer.vip')}
            </button>
            <LocalizedLink to="/about" className="hover:opacity-70 transition-opacity mt-1" style={{ fontSize: '14px', ...textMuted }}>
              {t('ui.footer.about')}
            </LocalizedLink>
            <div className="flex items-center gap-3 mt-1">
              <span style={{ fontSize: '14px', ...textMuted }}>{t('ui.footer.followUs')}</span>
              <a href="https://www.instagram.com/storyboardsphotos/" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                <Instagram size={20} style={{ color: iconPink }} />
              </a>
              <a href="https://www.facebook.com/storyboardsbot" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                <Facebook size={20} style={{ color: iconPink }} />
              </a>
            </div>
            </>
            )}

            {/* Language switcher — hides itself on pages without a translated version */}
            <div className="mt-2">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
