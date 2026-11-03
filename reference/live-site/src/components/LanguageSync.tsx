import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '@/hooks/useLang';

/** Keeps i18next and <html lang> in sync with the language in the URL. */
export function LanguageSync() {
  const lang = useLang();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== lang) i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang, i18n]);

  return null;
}
