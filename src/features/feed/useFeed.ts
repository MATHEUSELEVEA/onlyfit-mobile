import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isMembershipActive, type MembershipStatusRow } from '@/features/creators/membership';
import type { FeedPost } from './types';

const PAGE_SIZE = 10;

// Linha crua retornada pelo select em `posts` (mesmo modelo do onlyfit v1).
interface PostRow {
  id: string;
  creator_id: string;
  title: string | null;
  description: string | null;
  is_premium: boolean;
  thumbnail_url: string | null;
  video_url: string | null;
  likes: number | null;
  comments: number | null;
  published_at: string;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    is_creator: boolean | null;
  } | null;
}

interface ViewerState {
  likedPostIds: Set<string>;
  followedCreatorIds: Set<string>;
  subscribedCreatorIds: Set<string>;
}

function toFeedPost(row: PostRow, viewer: ViewerState): FeedPost {
  return {
    id: row.id,
    author: {
      id: row.creator_id,
      username: row.profiles?.username ?? 'creator',
      displayName: row.profiles?.full_name ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      verified: Boolean(row.profiles?.is_creator),
    },
    caption: row.description ?? row.title ?? '',
    mediaUrl: row.video_url ?? row.thumbnail_url,
    mediaType: row.video_url ? 'video' : 'image',
    likeCount: row.likes ?? 0,
    commentCount: row.comments ?? 0,
    createdAt: row.published_at,
    product: null, // banner de produto entra na próxima etapa
    likedByMe: viewer.likedPostIds.has(row.id),
    authorFollowedByMe: viewer.followedCreatorIds.has(row.creator_id),
    authorSubscribedByMe: viewer.subscribedCreatorIds.has(row.creator_id),
  };
}

// Estado do usuário sobre os posts/creators da página, em lote (como no v1):
// curtidas, follows ativos e assinaturas (memberships + fallback legado).
async function fetchViewerState(
  userId: string,
  postIds: string[],
  creatorIds: string[],
): Promise<ViewerState> {
  const [likesResp, followsResp, membershipsResp, legacySubsResp] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase
      .from('creator_follows')
      .select('creator_id')
      .eq('follower_id', userId)
      .eq('status', 'active')
      .in('creator_id', creatorIds),
    supabase
      .from('creator_memberships')
      .select('creator_id, status, current_period_end, grace_until')
      .eq('user_id', userId)
      .in('creator_id', creatorIds),
    supabase
      .from('subscriptions')
      .select('creator_id')
      .eq('subscriber_id', userId)
      .eq('status', 'active')
      .in('creator_id', creatorIds),
  ]);

  const likedPostIds = new Set(
    ((likesResp.data ?? []) as { post_id: string }[]).map((row) => row.post_id),
  );
  const followedCreatorIds = new Set(
    ((followsResp.data ?? []) as { creator_id: string }[]).map((row) => row.creator_id),
  );

  const subscribedCreatorIds = new Set<string>();
  ((membershipsResp.data ?? []) as ({ creator_id: string } & MembershipStatusRow)[]).forEach(
    (membership) => {
      if (isMembershipActive(membership)) subscribedCreatorIds.add(membership.creator_id);
    },
  );
  ((legacySubsResp.data ?? []) as { creator_id: string | null }[]).forEach((sub) => {
    if (sub.creator_id) subscribedCreatorIds.add(sub.creator_id);
  });

  return { likedPostIds, followedCreatorIds, subscribedCreatorIds };
}

async function fetchFeedPosts(userId: string, sports: string[]): Promise<FeedPost[]> {
  // Mesma RPC do onlyfit v1: retorna os ids na ordem correta do feed "home".
  // p_sports null = sem filtro ("Tudo"); array = filtra por grupo de afinidade.
  const { data: idRows, error: rpcError } = await supabase.rpc('feed_home_posts_page', {
    p_limit: PAGE_SIZE,
    p_offset: 0,
    p_sports: sports.length ? sports : null,
  });
  if (rpcError) throw rpcError;

  const ids = ((idRows ?? []) as { post_id: string }[]).map((r) => r.post_id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .select(
      `id, creator_id, title, description, is_premium, thumbnail_url, video_url,
       likes, comments, published_at,
       profiles:creator_id!inner (username, full_name, avatar_url, is_creator)`,
    )
    .in('id', ids);
  if (error) throw error;

  const byId = new Map((data as unknown as PostRow[]).map((row) => [row.id, row]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((row): row is PostRow => Boolean(row));

  const creatorIds = [...new Set(rows.map((row) => row.creator_id))];
  const viewer = await fetchViewerState(userId, rows.map((row) => row.id), creatorIds);

  return rows.map((row) => toFeedPost(row, viewer));
}

export function useFeed(sports: string[]) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['feed', userId, sports],
    queryFn: () => fetchFeedPosts(userId!, sports),
    enabled: Boolean(userId),
  });
}
