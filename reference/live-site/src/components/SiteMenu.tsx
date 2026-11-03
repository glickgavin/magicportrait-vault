import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "@/components/LocalizedLink";
import { stripLang } from "@/lib/langRoutes";
import { Menu, X, MessageCircle, Headphones, Info } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import mpLogo from "@/assets/MP-Logo-2.svg";
import thumbPet from "@/assets/bathroom-bliss-2-pets-journal.webp";
import thumbMasterpiece from "@/assets/masterpiece/menu-thumb.jpg";
import thumbFamily from "@/assets/family-comic.webp";
import thumbMemorial from "@/assets/theme-heavenly.webp";
import thumbTiles from "@/assets/tile-baby.webp";
import thumbBooks from "@/assets/book.webp";

const MAGENTA = "#DD07C4";
const BRAND_GRADIENT = "linear-gradient(90deg, #FF8F3F 0%, #F24BDF 50%, #DD07C4 100%)";
const NUM_FONT = "'League Gothic', 'Oswald', Impact, sans-serif";
const ELEV_2 = "0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)";
const ELEV_GLOW = "0 0 0 1px rgba(221,7,196,0.16), 0 8px 28px rgba(221,7,196,0.28)";

interface NavItem {
  n: string;
  titleKey: string;
  descKey: string;
  to: string;
  thumb: string;
  event: string;
}

const NAV_ITEMS: NavItem[] = [
  { n: "01", titleKey: "ui.menu.petTitle",      descKey: "ui.menu.petDesc",      to: "/start",       thumb: thumbPet,          event: "magic_portraits" },
  { n: "02", titleKey: "ui.menu.masterpieceTitle", descKey: "ui.menu.masterpieceDesc", to: "/masterpiece", thumb: thumbMasterpiece, event: "masterpiece" },
  { n: "03", titleKey: "ui.menu.familyTitle",   descKey: "ui.menu.familyDesc",   to: "/humans",      thumb: thumbFamily,       event: "human_portraits" },
  { n: "04", titleKey: "ui.menu.memorialTitle", descKey: "ui.menu.memorialDesc", to: "/memorial",    thumb: thumbMemorial,     event: "memorial" },
  { n: "05", titleKey: "ui.menu.tilesTitle",    descKey: "ui.menu.tilesDesc",    to: "/photo-tiles", thumb: thumbTiles,        event: "photo_tiles" },
  { n: "06", titleKey: "ui.menu.booksTitle",    descKey: "ui.menu.booksDesc",    to: "/photo-books", thumb: thumbBooks,        event: "photo_books" },
];

const trackClick = (label: string) => {
  try {
    track("cta_pressed", { button_label: label, location: "site_menu" });
  } catch {
    // no-op if analytics unavailable
  }
};

export const SiteMenu = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t } = useTranslation();
  // Compare against the language-stripped path, so /es/start still matches /start.
  const basePath = stripLang(pathname);

  const close = () => setOpen(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) trackClick("site_menu_opened");
  };

  const trackAndClose = (label: string) => () => {
    trackClick(`site_menu_${label}`);
    close();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("ui.menu.open")}
          className="h-10 w-10 rounded-[12px] bg-transparent hover:bg-black/5"
        >
          <Menu className="h-8 w-8 md:h-9 md:w-9" strokeWidth={2.5} style={{ color: "rgba(0,0,0,0.8)" }} />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0 overflow-y-auto [&>button]:hidden"
        style={{ backgroundColor: "#FBF6EE" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <img src={mpLogo} alt="Magic Portraits" className="h-8" />
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("ui.menu.close")}
              className="h-9 w-9 rounded-[12px]"
              style={{ backgroundColor: "rgba(0,0,0,0.05)" }}
            >
              <X className="h-5 w-5" style={{ color: "rgba(0,0,0,0.8)" }} />
            </Button>
          </SheetClose>
        </div>

        {/* Lead label */}
        <div
          className="px-6 pt-4 pb-3 text-xs tracking-[0.22em] uppercase"
          style={{ color: MAGENTA, fontWeight: 600 }}
        >
          {t("ui.menu.lead")}
        </div>

        {/* Editorial list */}
        <nav className="px-6 pb-6 flex flex-col">
          {NAV_ITEMS.map((item, i) => {
            const active = basePath === item.to;
            const isLast = i === NAV_ITEMS.length - 1;
            return (
              <LocalizedLink
                key={item.to}
                to={item.to}
                onClick={trackAndClose(item.event)}
                className="group grid grid-cols-[24px_1fr_64px] items-center gap-4 py-4 transition-opacity hover:opacity-90"
                style={{ borderBottom: isLast ? "none" : "1px solid rgba(0,0,0,0.08)" }}
              >
                <span
                  className="text-[15px] leading-none"
                  style={{
                    fontFamily: NUM_FONT,
                    color: "rgba(0,0,0,0.2)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {item.n}
                </span>

                <div className="min-w-0">
                  <div
                    className="text-[22px] leading-tight font-extrabold tracking-[-0.01em]"
                    style={
                      active
                        ? {
                            backgroundImage: BRAND_GRADIENT,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                          }
                        : { color: "rgba(0,0,0,0.88)" }
                    }
                  >
                    {t(item.titleKey)}
                  </div>
                  <div
                    className="mt-1 text-[13px] leading-snug"
                    style={{ color: "rgba(0,0,0,0.55)" }}
                  >
                    {t(item.descKey)}
                  </div>
                </div>

                <div
                  className="justify-self-end overflow-hidden rounded-[10px] bg-white transition-all"
                  style={{
                    width: active ? 68 : 56,
                    height: active ? 68 : 56,
                    boxShadow: active ? ELEV_GLOW : ELEV_2,
                  }}
                >
                  <img
                    src={item.thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </LocalizedLink>
            );
          })}
        </nav>

        {/* Utility footer */}
        <div
          className="mt-auto px-6 py-5 flex flex-col gap-1"
          style={{
            borderTop: "1px solid rgba(0,0,0,0.08)",
            color: "rgba(0,0,0,0.8)",
            fontSize: "15px",
          }}
        >
          <LocalizedLink
            to="/faq"
            onClick={trackAndClose("faq")}
            className="flex items-center gap-3 py-2.5 transition-opacity hover:opacity-70"
          >
            <MessageCircle className="w-5 h-5 flex-shrink-0" style={{ color: MAGENTA }} />
            <span>{t("ui.footer.faq")}</span>
          </LocalizedLink>

          <button
            type="button"
            onClick={() => {
              trackClick("site_menu_contact_support");
              (window as unknown as { Intercom?: (cmd: string) => void }).Intercom?.("show");
              close();
            }}
            className="flex w-full items-center gap-3 py-2.5 text-left transition-opacity hover:opacity-70"
          >
            <Headphones className="w-5 h-5 flex-shrink-0" style={{ color: MAGENTA }} />
            <span>{t("ui.footer.chat")}</span>
          </button>

          <LocalizedLink
            to="/about"
            onClick={trackAndClose("about")}
            className="flex items-center gap-3 py-2.5 transition-opacity hover:opacity-70"
          >
            <Info className="w-5 h-5 flex-shrink-0" style={{ color: MAGENTA }} />
            <span>{t("ui.footer.about")}</span>
          </LocalizedLink>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SiteMenu;
