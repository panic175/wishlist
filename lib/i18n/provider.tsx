'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { dictionary, isSupportedLanguage, type Language } from './translations';

interface LanguageContextValue {
  lang: Language;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  t: (key) => key,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (active && data?.success) {
          const settingLang = data.settings?.language;
          if (isSupportedLanguage(settingLang)) {
            setLang(settingLang);
          }
        }
      } catch (err) {
        // Fall back to English on error
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = dictionary[lang][key] ?? dictionary.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, t }}>{children}</LanguageContext.Provider>
  );
}
