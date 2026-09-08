const legacyDefaults: Readonly<Record<string, ReadonlySet<string>>> = {
  premium_content: new Set([
    'conteúdo premium',
    'conteudo premium',
    'conteúdo premium do perfil',
    'conteudo premium do perfil',
    'assinatura premium',
    'premium content',
    'premium signature',
    'premium subscription',
  ]),
  health_consultancy: new Set(['consultoria de saúde', 'consultoria de saude', 'health consultancy']),
};

const currentDefaults: Readonly<Record<string, string>> = {
  premium_content: 'Clube',
  health_consultancy: 'Consultoria',
};

export function offeringPresentationName(type: string | null | undefined, rawName: string | null | undefined) {
  const slug = type ?? '';
  const name = rawName?.trim();
  if (!name) return currentDefaults[slug] ?? 'Oferta';
  return legacyDefaults[slug]?.has(name.toLocaleLowerCase('pt-BR')) ? currentDefaults[slug] : name;
}
