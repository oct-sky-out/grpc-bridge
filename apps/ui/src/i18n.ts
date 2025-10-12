import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';
import ko from '@/locales/ko.json';

const resources = {
  en: {
    translation: en,
  },
  ja: {
    translation: ja,
  },
  ko: {
    translation: ko,
  },
};

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,

    // Language to use if translations in user language are not available
    fallbackLng: 'en',

    // Default namespace
    defaultNS: 'translation',

    debug: false, // Set to true for development debugging

    interpolation: {
      escapeValue: false, // React already does escaping
    },

    // Language detection options
    detection: {
      // Available language detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],

      // Cache user language
      caches: ['localStorage'],

      // Optional htmlTag with lang attribute
      htmlTag: document.documentElement,

      // Optional set cookie options, reference:[MDN Set-Cookie docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
      cookieOptions: { path: '/', sameSite: 'strict' },
    },

    // React options
    react: {
      // Wait for i18n to be initialized before rendering
      useSuspense: false,

      // Bind the t function to the component
      bindI18n: 'languageChanged',

      // Bind the i18n store to the component
      bindI18nStore: '',

      // Experimental: use React.Suspense
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em'],
    },
  });

export default i18n;
