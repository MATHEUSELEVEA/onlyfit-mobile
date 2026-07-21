import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useOfferingCheckout() {
  return useMutation({
    mutationFn: async (input: { offeringId: string; billingType: 'one_time' | 'recurring'; cardId?: string }) => {
      const functionName = input.billingType === 'recurring' ? 'checkout-offering-subscription' : 'checkout-offering-one-time';
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          offering_id: input.offeringId,
          ...(input.cardId ? { card_id: input.cardId } : {}),
          request_key: crypto.randomUUID(),
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'checkout_failed');
      return data as Record<string, unknown>;
    },
  });
}
