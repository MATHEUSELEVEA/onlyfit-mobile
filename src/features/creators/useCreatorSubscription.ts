import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isMembershipActive, type MembershipStatusRow } from './membership';

// Estado de assinatura do usuário com um creator: memberships (modelo atual)
// com fallback na tabela legada `subscriptions` — mesma regra do onlyfit v1.
// Somente leitura: assinar passa por checkout/pagamento, nunca por escrita
// direta do cliente nessas tabelas.
export function useCreatorSubscription(creatorId: string | null | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['creator-subscription', creatorId, userId],
    enabled: Boolean(creatorId && userId),
    queryFn: async (): Promise<boolean> => {
      const [membershipsResp, legacyResp] = await Promise.all([
        supabase
          .from('creator_memberships')
          .select('status, current_period_end, grace_until')
          .eq('creator_id', creatorId!)
          .eq('user_id', userId!),
        supabase
          .from('subscriptions')
          .select('creator_id')
          .eq('creator_id', creatorId!)
          .eq('subscriber_id', userId!)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (membershipsResp.error) throw membershipsResp.error;
      const hasMembership = ((membershipsResp.data ?? []) as MembershipStatusRow[]).some(
        isMembershipActive,
      );
      return hasMembership || Boolean(legacyResp.data);
    },
  });
}
