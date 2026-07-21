import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export type WalletSummary = {
  professional_profile_id: string;
  available_balance: number;
  pending_balance: number;
  reserved_balance: number;
};

export type WalletEntry = {
  id: string;
  entry_type: string;
  amount: number;
  created_at: string;
};

export function useProfessionalWallet() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ['professional-wallet', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<WalletSummary | null> => {
      const { data, error } = await supabase.from('professional_wallets').select('*').maybeSingle();
      if (error) throw error;
      return (data as WalletSummary | null) ?? null;
    },
  });

  const ledger = useQuery({
    queryKey: ['wallet-ledger', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<WalletEntry[]> => {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id,entry_type,amount,created_at')
        .eq('professional_profile_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WalletEntry[];
    },
  });

  const payout = useMutation({
    mutationFn: async (amount: number) => {
      const { data, error } = await supabase.rpc('request_payout', { p_amount: amount });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['professional-wallet', userId] });
      void queryClient.invalidateQueries({ queryKey: ['wallet-ledger', userId] });
    },
  });

  return { summary, ledger, payout };
}
