import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { inboxKey } from './keys';
import type { Conversation, MediaType } from './types';

interface ConversationRow {
  peer_id: string;
  peer_name: string | null;
  peer_username: string | null;
  peer_avatar_url: string | null;
  last_message_body: string | null;
  last_media_type: MediaType | null;
  last_at: string;
  unread_count: number;
}

export function useConversations() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: inboxKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase.rpc('list_my_conversations', {
        p_limit: 100,
      });
      if (error) throw error;
      return ((data ?? []) as ConversationRow[]).map((row) => ({
        peer: {
          id: row.peer_id,
          name: row.peer_name || row.peer_username,
          avatarUrl: row.peer_avatar_url,
        },
        lastMessage: row.last_message_body,
        lastMediaType: row.last_media_type,
        timestamp: row.last_at,
        unread: Math.max(0, Number(row.unread_count) || 0),
      }));
    },
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
