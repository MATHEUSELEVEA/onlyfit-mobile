import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { loadOnlyFitStripe } from '@/lib/stripe';
import { usePaymentCards } from './usePaymentCards';

const STRIPE_CONFIG_QUERY_KEY = ['payment-stripe-config'] as const;

function useStripePaymentConfig(enabled: boolean) {
  const { session } = useAuth();

  return useQuery({
    queryKey: STRIPE_CONFIG_QUERY_KEY,
    enabled: enabled && Boolean(session?.user.id),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    queryFn: async (): Promise<{ publishableKey: string }> => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        publishable_key?: string;
      }>('payment-stripe-config', { body: {} });
      if (error || data?.ok !== true || !data.publishable_key) {
        throw new Error('stripe_config_unavailable');
      }
      return { publishableKey: data.publishable_key };
    },
  });
}

export function usePaymentPreload(enabled: boolean) {
  const cardsQuery = usePaymentCards({ enabled });
  const stripeConfig = useStripePaymentConfig(enabled);

  useEffect(() => {
    const key = stripeConfig.data?.publishableKey;
    if (!enabled || !key) return;
    void loadOnlyFitStripe(key);
  }, [enabled, stripeConfig.data?.publishableKey]);

  return {
    cardsReady: cardsQuery.isSuccess,
    stripeReady: Boolean(stripeConfig.data?.publishableKey),
  };
}
