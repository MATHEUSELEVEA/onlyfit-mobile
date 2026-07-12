/** Países oferecidos no cadastro (mesma lista do v1). */
export const COUNTRY_OPTIONS: { code: string; flag: string; displayCode?: string }[] = [
  { code: 'BR', flag: '🇧🇷' },
  { code: 'US', flag: '🇺🇸' },
  { code: 'PT', flag: '🇵🇹' },
  { code: 'ES', flag: '🇪🇸' },
  { code: 'MX', flag: '🇲🇽' },
  { code: 'AR', flag: '🇦🇷' },
  { code: 'CL', flag: '🇨🇱' },
  { code: 'CO', flag: '🇨🇴' },
  { code: 'PE', flag: '🇵🇪' },
  { code: 'FR', flag: '🇫🇷' },
  { code: 'DE', flag: '🇩🇪' },
  { code: 'IT', flag: '🇮🇹' },
  { code: 'GB', flag: '🇬🇧', displayCode: 'UK' },
  { code: 'CA', flag: '🇨🇦' },
  { code: 'AU', flag: '🇦🇺' },
  { code: 'JP', flag: '🇯🇵' },
];

/** Nome do país no locale do navegador; cai no código se o Intl falhar. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Detecta o país inicial pelo locale do navegador; default US (igual v1). */
export function detectCountryCode(): string {
  if (typeof navigator === 'undefined') return 'US';
  const locale = navigator.language || 'en-US';
  const detected = locale.split('-')[1]?.toUpperCase() || 'US';
  const normalized = detected === 'UK' ? 'GB' : detected;
  return COUNTRY_OPTIONS.some((c) => c.code === normalized) ? normalized : 'US';
}
