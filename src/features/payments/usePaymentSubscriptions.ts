import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export type PaymentSubscription = {
  id: string;
  offering_id: string | null;
  offering_name: string | null;
  professional_name: string | null;
  provider: string | null;
  payment_method: string | null;
  value: number;
  cycle: string;
  status: string;
  next_due_date: string | null;
  canceled_at: string | null;
  created_at: string;
  card_last4: string | null;
  card_brand: string | null;
};

/** Uma linha por assinatura contratada — não por cobrança (isso é o extrato). */
export function usePaymentSubscriptions() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['payment-subscriptions', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<PaymentSubscription[]> => {
      const { data, error } = await supabase.rpc('list_my_payment_subscriptions', {
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as PaymentSubscription[];
    },
  });
}
