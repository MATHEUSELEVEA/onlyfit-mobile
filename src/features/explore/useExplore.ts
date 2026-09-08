import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { sanitizeSearchTerm } from '@/lib/search';
import { useAuth } from '@/contexts/AuthContext';

export interface ExploreCreator {
  id: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  bio: string;
  sports: string[];
  followerCount: number;
  followedByMe: boolean;
  /** Identidade no mobile: profissional (casca de profissional ligada) ou membro. */
  isProfessional: boolean;
  ambassadorBadge?: string | null;
  ambassadorHeadline?: string | null;
  ambassadorSport?: string | null;
}

interface CreatorRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_professional: boolean | null;
  creator_profiles:
    | { bio: string | null; sports: string[] | null; follower_count: number | null }
    | { bio: string | null; sports: string[] | null; follower_count: number | null }[]
    | null;
}

function toExploreCreator(
  row: CreatorRow,
  followedIds: Set<string>,
  ambassador?: { badgeLabel?: string | null; headline?: string | null; sportKey?: string | null },
): ExploreCreator {
  const cp = Array.isArray(row.creator_profiles)
    ? row.creator_profiles[0]
    : row.creator_profiles;
  return {
    id: row.id,
    username: row.username,
    name: row.full_name || row.username || 'Usuário',
    avatarUrl: row.avatar_url,
    bio: cp?.bio ?? '',
    sports: cp?.sports ?? [],
    followerCount: cp?.follower_count ?? 0,
    followedByMe: followedIds.has(row.id),
    isProfessional: Boolean(row.is_professional),
    ambassadorBadge: ambassador?.badgeLabel ?? null,
    ambassadorHeadline: ambassador?.headline ?? null,
    ambassadorSport: ambassador?.sportKey ?? null,
  };
}

// Pessoas para descoberta: qualquer perfil (profissional OU usuário comum),
// com os dados públicos de creator_profiles hidratados via join opcional
// (nulos para quem não é profissional) e o follow do usuário em lote.
// Sem filtro de is_creator — o Explorar mostra todos. Exclui o próprio usuário.
//
// Sem termo de busca: amostra dos 50 primeiros (navegação). Com termo (>=2
// chars): filtra no SERVIDOR por nome/username sobre TODOS os perfis — sem
// isso a busca só enxergaria os 50 pré-carregados e a maioria dos usuários
// (ex.: quem não está na amostra) nunca apareceria.
export function useExploreCreators(searchTerm = '') {
  const { session } = useAuth();
  const userId = session?.user.id;
  const term = sanitizeSearchTerm(searchTerm);
  const hasTerm = term.length >= 2;

  return useQuery({
    queryKey: ['explore-creators', userId, hasTerm ? term.toLowerCase() : ''],
    enabled: Boolean(userId),
    staleTime: hasTerm ? 60_000 : 5 * 60_000,
    queryFn: async (): Promise<ExploreCreator[]> => {
      let query = supabase
        .from('profiles')
        .select(
          `id, username, full_name, avatar_url, is_professional,
           creator_profiles (bio, sports, follower_count)`,
        )
        .neq('id', userId!);
      if (hasTerm) {
        query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
      }
      const { data, error } = await query.limit(50);
      if (error) throw error;

      const rows = (data ?? []) as unknown as CreatorRow[];
      const creatorIds = rows.map((row) => row.id);

      const { data: follows } = creatorIds.length
        ? await supabase
            .from('creator_follows')
            .select('creator_id')
            .eq('follower_id', userId!)
            .eq('status', 'active')
            .in('creator_id', creatorIds)
        : { data: [] };
      const followedIds = new Set(
        ((follows ?? []) as { creator_id: string }[]).map((row) => row.creator_id),
      );

      return rows.map((row) => toExploreCreator(row, followedIds));
    },
  });
}

export function useFeaturedAmbassadors() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['featured-ambassadors', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExploreCreator[]> => {
      const { data, error } = await supabase.rpc('list_public_ambassadors' as never, {
        p_affinity_group_key: null, p_region_id: null, p_limit: 100, p_offset: 0,
      } as never);
      if (error) throw error;
      const payload = data as unknown as { items?: Array<Record<string, unknown>> } | null;
      const rows = payload?.items ?? [];
      const profileRows = rows.map((row) => row.profile as Record<string, unknown>);

      const { data: follows } = profileRows.length
        ? await supabase
            .from('creator_follows')
            .select('creator_id')
            .eq('follower_id', userId!)
            .eq('status', 'active')
            .in('creator_id', profileRows.map((profile) => String(profile.id)))
        : { data: [] };
      const followedIds = new Set(
        ((follows ?? []) as { creator_id: string }[]).map((row) => row.creator_id),
      );

      return rows.map((row) => {
        const profile = row.profile as { id: string; username?: string | null; name?: string | null; avatar_url?: string | null; bio?: string | null };
        return {
          id: profile.id, username: profile.username ?? null, name: profile.name || profile.username || 'Usuário',
          avatarUrl: profile.avatar_url ?? null, bio: profile.bio ?? '', sports: [String(row.affinity_group_key ?? '')],
          followerCount: Number(row.follower_count ?? 0), followedByMe: followedIds.has(profile.id), isProfessional: false,
          ambassadorBadge: String(row.badge_label ?? ''), ambassadorHeadline: String(row.headline ?? ''),
          ambassadorSport: String(row.affinity_group_key ?? ''),
        } satisfies ExploreCreator;
      });
    },
  });
}

export interface ExploreContentItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  hasVideo: boolean;
  /** URL do vídeo, quando houver — usada para o preview em autoplay na grade. */
  videoUrl: string | null;
  likes: number;
  creatorId: string;
  creatorName: string;
  creatorUsername: string | null;
  /** Esportes do post; vazio = herda os do creator (paridade com o feed do v1). */
  sports: string[];
}

interface ContentRow {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  likes: number | null;
  sports: string[] | null;
  creator_id: string;
  profiles:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null;
}

// Conteúdo público recente de qualquer autor (profissional ou usuário comum),
// sem personalização — o objetivo é descoberta. Sem filtro de is_creator:
// posts públicos de todos entram. RLS/visibility já restringem ao público.
// Só conteúdo gratuito: o Explorar existe para descobrir sem pagar (o que é
// pago vive no Produtos), então post premium fica de fora.
export function useExploreContent() {
  return useQuery({
    queryKey: ['explore-content'],
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<ExploreContentItem[]> => {
      const ranked = await supabase.rpc('list_discover_content_v1' as never, {
        p_sports: null,
        p_limit: 24,
      } as never);
      let rankedIds: string[] | null = null;
      if (!ranked.error) {
        rankedIds = ((ranked.data ?? []) as { post_id: string }[]).map((row) => row.post_id);
        if (rankedIds.length === 0) return [];
      } else if (!['PGRST202', '42883'].includes(ranked.error.code ?? '')) {
        throw ranked.error;
      }

      let query = supabase
        .from('visible_posts')
        .select(
          `id, title, thumbnail_url, video_url, likes, sports, creator_id,
           profiles:creator_id!inner (full_name, username)`,
        )
        .eq('visibility', 'public')
        // `not is true` (e não `eq false`) porque is_premium é nullable no
        // schema do v1: nulo é conteúdo gratuito antigo e precisa entrar.
        .not('is_premium', 'is', true)
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString());
      query = rankedIds
        ? query.in('id', rankedIds)
        : query.order('published_at', { ascending: false }).limit(24);
      const { data, error } = await query;
      if (error) throw error;

      const items = ((data ?? []) as unknown as ContentRow[]).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          title: row.title ?? '',
          thumbnailUrl: row.thumbnail_url,
          hasVideo: Boolean(row.video_url),
          videoUrl: row.video_url,
          likes: row.likes ?? 0,
          creatorId: row.creator_id,
          creatorName: profile?.full_name || profile?.username || 'Usuário',
          creatorUsername: profile?.username ?? null,
          sports: row.sports ?? [],
        };
      });
      if (!rankedIds) return items;
      const order = new Map(rankedIds.map((id, index) => [id, index]));
      return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
  });
}

export interface ExploreCommunity {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  creatorId: string;
  creatorName: string;
  creatorUsername: string | null;
}

interface CommunityRow {
  id: string;
  name: string | null;
  description: string | null;
  member_count: number | null;
  creator_id: string;
  profiles:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null;
}

// Comunidades para descoberta, mesmo padrão do useCreatorCommunities (hub do
// criador) mas sem filtrar por creator_id — vitrine com todas as comunidades.
export function useExploreCommunities() {
  return useQuery({
    queryKey: ['explore-communities'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExploreCommunity[]> => {
      const { data, error } = await supabase
        .from('communities')
        .select(
          `id, name, description, member_count, creator_id,
           profiles:creator_id (full_name, username)`,
        )
        .order('member_count', { ascending: false })
        .limit(24);
      if (error) throw error;

      return ((data ?? []) as unknown as CommunityRow[]).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          name: row.name || 'Comunidade',
          description: row.description ?? null,
          memberCount: row.member_count ?? 0,
          creatorId: row.creator_id,
          creatorName: profile?.full_name || profile?.username || 'Creator',
          creatorUsername: profile?.username ?? null,
        };
      });
    },
  });
}

export interface ExploreChallenge {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  participantCount: number;
  creatorId: string;
  creatorName: string;
  creatorUsername: string | null;
}

interface ChallengeRow {
  id: string;
  name: string | null;
  description: string | null;
  cover_image_url: string | null;
  participant_count: number | null;
  creator_id: string;
  profiles:
    | { full_name: string | null; username: string | null }
    | { full_name: string | null; username: string | null }[]
    | null;
}

// Desafios para descoberta, mesmo padrão do useCreatorChallenges (hub do
// criador) mas sem filtrar por creator_id — vitrine com todos os desafios.
export function useExploreChallenges() {
  return useQuery({
    queryKey: ['explore-challenges'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExploreChallenge[]> => {
      const { data, error } = await supabase
        .from('challenge_runs')
        .select(
          `id, name, description, cover_image_url, participant_count, creator_id, status,
           profiles:creator_id (full_name, username)`,
        )
        .in('status', ['active', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(24);
      if (error) throw error;

      return ((data ?? []) as unknown as ChallengeRow[]).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          name: row.name || 'Desafio',
          description: row.description ?? null,
          coverImageUrl: row.cover_image_url,
          participantCount: row.participant_count ?? 0,
          creatorId: row.creator_id,
          creatorName: profile?.full_name || profile?.username || 'Creator',
          creatorUsername: profile?.username ?? null,
        };
      });
    },
  });
}
