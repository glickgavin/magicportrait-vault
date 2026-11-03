import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANG } from '@/lib/langRoutes';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import it from '@/locales/it.json';
import de from '@/locales/de.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    de: { translation: de },
  },
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export default i18n;
