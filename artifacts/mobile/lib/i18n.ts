import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

import en from "./translations/en";
import fr from "./translations/fr";
import es from "./translations/es";
import pt from "./translations/pt";
import ar from "./translations/ar";
import zh from "./translations/zh";
import de from "./translations/de";
import it from "./translations/it";
import ja from "./translations/ja";
import ko from "./translations/ko";

export type TranslationKey = keyof typeof en;

export const LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const translations: Record<LanguageCode, Record<string, string>> = {
  en, fr, es, pt, ar, zh, de, it, ja, ko,
};

const STORAGE_KEY = "app_language";

interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  isRTL: boolean;
}

export const I18nContext = createContext<I18nContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function useI18nProvider() {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && translations[saved as LanguageCode]) {
        setLanguageState(saved as LanguageCode);
      }
    });
  }, []);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>): string => {
      let text = translations[language]?.[key] || translations.en[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(`{{${k}}}`, v);
        });
      }
      return text;
    },
    [language]
  );

  const isRTL = language === "ar";

  return { language, setLanguage, t, isRTL };
}
