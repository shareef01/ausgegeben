import { useCallback, useMemo } from 'react';
import { en, type TranslationKey } from './en';
import { de } from './de';
import { usePreferencesStore } from '@/services/preferencesStore';

export type Locale = 'en' | 'de';

const catalogs: Record<Locale, Record<TranslationKey, string>> = { en, de };

export function getLocale(): Locale {
  return usePreferencesStore.getState().locale;
}

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const locale = getLocale();
  let text = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

export function useTranslation() {
  const locale = usePreferencesStore((s) => s.locale);
  // Stable across renders (deps: locale only) — callers put `t` in useCallback/useEffect
  // dependency arrays (e.g. useAddTransactionViewModel's `load`); an unstable `t` here
  // previously caused those effects to re-run on every render, e.g. re-fetching
  // categories and resetting the Add Transaction form on every keystroke.
  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string>) => {
      let text = catalogs[locale][key] ?? catalogs.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, v);
        }
      }
      return text;
    },
    [locale],
  );
  return useMemo(() => ({ t: translate, locale }), [translate, locale]);
}

export type { TranslationKey } from './en';

export function localeTag(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : 'en-US';
}
