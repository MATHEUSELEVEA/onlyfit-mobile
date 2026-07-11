// Taxonomia de esportes/grupos de afinidade do app (feed e explorar).
// Chaves IGUAIS às do banco do onlyfit v1 (parâmetro p_sports da RPC
// feed_home_posts_page e coluna sports de posts/creator_profiles),
// para que os filtros funcionem de verdade.
export interface FeedSport {
  key: string;
  label: string;
}

export const FEED_SPORTS: FeedSport[] = [
  { key: 'bodybuilding', label: 'Musculação' },
  { key: 'martial_arts', label: 'Lutas' },
  { key: 'running', label: 'Corrida' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'crossfit', label: 'CrossFit' },
  { key: 'cycling', label: 'Ciclismo' },
  { key: 'swimming', label: 'Natação' },
  { key: 'nutrition', label: 'Nutrição' },
];

const SPORT_LABELS = new Map(FEED_SPORTS.map((sport) => [sport.key, sport.label]));

export function sportLabel(key: string): string {
  return SPORT_LABELS.get(key) ?? key;
}
