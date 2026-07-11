import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
}

interface CreatorRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  creator_profiles:
    | { bio: string | null; sports: string[] | null; follower_count: number | null }
    | { bio: string | null; sports: string[] | null; follower_count: number | null }[]
    | null;
}

// Creators para descoberta (mesma fonte do Discover do v1): perfis com
// is_creator + dados públicos de creator_profiles, com follow do usuário
// hidratado em lote. Busca/filtros são aplicados no cliente sobre esta lista.
export function useExploreCreators() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['explore-creators', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExploreCreator[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, username, full_name, avatar_url,
           creator_profiles (bio, sports, follower_count)`,
        )
        .eq('is_creator', true)
        .limit(50);
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

      return rows.map((row) => {
        const cp = Array.isArray(row.creator_profiles)
          ? row.creator_profiles[0]
          : row.creator_profiles;
        return {
          id: row.id,
          username: row.username,
          name: row.full_name || row.username || 'Creator',
          avatarUrl: row.avatar_url,
          bio: cp?.bio ?? '',
          sports: cp?.sports ?? [],
          followerCount: cp?.follower_count ?? 0,
          followedByMe: followedIds.has(row.id),
        };
      });
    },
  });
}

export interface ExploreContentItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  hasVideo: boolean;
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

// Conteúdo público recente de creators, sem personalização — o objetivo é
// descoberta (mesma regra do Discover do v1). RLS já restringe ao público.
export function useExploreContent() {
  return useQuery({
    queryKey: ['explore-content'],
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<ExploreContentItem[]> => {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `id, title, thumbnail_url, video_url, likes, sports, creator_id,
           profiles:creator_id!inner (full_name, username, is_creator)`,
        )
        .eq('profiles.is_creator', true)
        .eq('visibility', 'public')
        .order('published_at', { ascending: false })
        .limit(24);
      if (error) throw error;

      return ((data ?? []) as unknown as ContentRow[]).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          title: row.title ?? '',
          thumbnailUrl: row.thumbnail_url,
          hasVideo: Boolean(row.video_url),
          likes: row.likes ?? 0,
          creatorId: row.creator_id,
          creatorName: profile?.full_name || profile?.username || 'Creator',
          creatorUsername: profile?.username ?? null,
          sports: row.sports ?? [],
        };
      });
    },
  });
}
