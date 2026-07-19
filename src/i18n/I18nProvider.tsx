import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type TranslationKey } from './translations';

export type { TranslationKey } from './translations';

// Para suportar um novo idioma no futuro: adicione o dicionário em
// translations.ts e inclua o código + rótulo aqui. Nenhum outro arquivo do
// app precisa saber quais idiomas existem.
// eslint-disable-next-line react-refresh/only-export-components -- lista de idiomas vive junto do provider
export const SUPPORTED_LANGUAGES = [
  { code: 'pt-BR', label: 'PT-BR', nativeName: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'PT-PT', nativeName: 'Português (Portugal)' },
  { code: 'en-US', label: 'EN', nativeName: 'English' },
  { code: 'es', label: 'ES', nativeName: 'Español' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const STORAGE_KEY = 'onlyfit.language';
const DEFAULT_LANGUAGE: LanguageCode = 'pt-BR';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});

export function normalizeLanguageCode(value: string | null | undefined): LanguageCode {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_LANGUAGE;

  const lower = raw.toLowerCase().replace('_', '-');
  if (lower === 'pt' || lower === 'pt-br' || lower.startsWith('pt-br-')) return 'pt-BR';
  if (lower === 'pt-pt' || lower.startsWith('pt-pt-')) return 'pt-PT';
  if (lower === 'en' || lower === 'en-us' || lower.startsWith('en-')) return 'en-US';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  return DEFAULT_LANGUAGE;
}

export function intlLocaleFromLanguage(language: string | null | undefined): string {
  const normalized = normalizeLanguageCode(language);
  if (normalized === 'pt-PT') return 'pt-PT';
  if (normalized === 'en-US') return 'en-US';
  if (normalized === 'es') return 'es-ES';
  return 'pt-BR';
}

function interpolate(value: string, params?: Record<string, string | number>) {
  if (!params) return value;
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

function isSupportedLanguage(value: string | null): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((option) => option.code === value);
}

function readStoredLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const normalized = normalizeLanguageCode(stored ?? navigator.language);
    return isSupportedLanguage(normalized) ? normalized : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[language];
    return {
      language,
      setLanguage: (next) => {
        const normalized = normalizeLanguageCode(next);
        setLanguageState(normalized);
        localStorage.setItem(STORAGE_KEY, normalized);
      },
      t: (key, params) => interpolate(dictionary[key], params),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook vive junto do provider
export function useTranslation() {
  return useContext(I18nContext);
}
