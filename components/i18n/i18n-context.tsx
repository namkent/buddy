"use client";

import React, { createContext, useContext, ReactNode } from "react";

type TranslationMap = Record<string, Record<string, string>>;

interface I18nContextType {
  lang: string;
  t: (type: string, key: string, fallback: string) => string;
  translations: TranslationMap;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

interface I18nProviderProps {
  children: ReactNode;
  lang: string;
  initialTranslations: TranslationMap;
}

export function I18nProvider({ children, lang, initialTranslations }: I18nProviderProps) {
  const t = (type: string, key: string, fallback: string): string => {
    return initialTranslations[type]?.[key] || fallback;
  };

  return (
    <I18nContext.Provider value={{ lang, t, translations: initialTranslations }}>
      {children}
    </I18nContext.Provider>
  );
}
