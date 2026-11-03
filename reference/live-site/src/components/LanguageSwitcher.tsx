import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useLang } from "@/hooks/useLang";
import { stripLang, localizePath, type Lang } from "@/lib/langRoutes";

// The routes that exist in every language. Must match the LOCALIZED_ROUTES
// table in src/App.tsx. If a route isn't here, the switcher hides itself
// (there's no translated page to switch to).
const LOCALIZED_BASE_PATHS = [
  "/start",
  "/humans",
  "/theme",
  "/confirm",
  "/generating",
  "/select-faces",
  "/memorial",
  "/photo-tiles",
  "/photo-books",
  "/about",
  "/faq",
];

// Each language labelled in its own tongue, with a flag.
const LANGS: Array<{ code: Lang; label: string; flag: string }> = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export function LanguageSwitcher() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const current = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Hide on any page without a translated equivalent.
  const base = stripLang(pathname);
  if (!LOCALIZED_BASE_PATHS.includes(base)) return null;

  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  const pick = (code: Lang) => {
    setOpen(false);
    if (code === current) return;
    navigate(`${localizePath(base, code)}${search}${hash}`);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-[12px] transition-opacity hover:opacity-70"
        style={{ backgroundColor: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.8)", fontSize: "14px" }}
      >
        <Globe className="w-4 h-4" style={{ color: "#dd07c4" }} />
        <span aria-hidden="true">{active.flag}</span>
        <span>{active.label}</span>
        <ChevronDown className="w-4 h-4 opacity-60" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 bottom-full mb-2 min-w-[160px] rounded-[12px] overflow-hidden shadow-lg z-50"
          style={{ backgroundColor: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          {LANGS.map((l) => {
            const selected = l.code === current;
            return (
              <li key={l.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => pick(l.code)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/[0.04]"
                  style={{ color: "rgba(0,0,0,0.8)", fontSize: "14px" }}
                >
                  <span aria-hidden="true">{l.flag}</span>
                  <span className="flex-1">{l.label}</span>
                  {selected && <Check className="w-4 h-4" style={{ color: "#dd07c4" }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default LanguageSwitcher;
