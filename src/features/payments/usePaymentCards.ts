import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Cartões tokenizados do usuário. O token vive só no servidor/processador
// (column-level security em payment_cards); o cliente só lê os metadados seguros
// e salva cartões Stripe via SetupIntent, sem enviar PAN/CVV ao backend.
export interface PaymentCard {
  id: string;
  provider: 'asaas' | 'stripe';
  brand: string | null;
  last4: string;
  holderName: string | null;
  nickname: string | null;
  isDefault: boolean;
  expMonth: number | null;
  expYear: number | null;
  createdAt: string;
}

export function paymentCardsQueryKey(userId: string | undefined) {
  return ['payment-cards', userId] as const;
}

function mapRow(row: {
  id: string;
  provider: 'asaas' | 'stripe';
  brand: string | null;
  last4: string;
  holder_name: string | null;
  nickname: string | null;
  is_default: boolean;
  exp_month: number | null;
  exp_year: number | null;
  created_at: string;
}): PaymentCard {
  return {
    id: row.id,
    provider: row.provider,
    brand: row.brand,
    last4: row.last4,
    holderName: row.holder_name,
    nickname: row.nickname,
    isDefault: row.is_default,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    createdAt: row.created_at,
  };
}

export function usePaymentCards(options: { enabled?: boolean } = {}) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const enabled = options.enabled ?? true;

  return useQuery({
    queryKey: paymentCardsQueryKey(userId),
    enabled: enabled && Boolean(userId),
    queryFn: async (): Promise<PaymentCard[]> => {
      const { data, error } = await supabase
        .from('payment_cards')
        .select('id, provider, brand, last4, holder_name, nickname, is_default, exp_month, exp_year, created_at')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export interface StripeSetupIntentStart {
  setupIntentId: string;
  clientSecret: string;
  publishableKey: string;
}

export interface SaveStripeCardInput {
  setupIntentId: string;
  nickname?: string;
}

/** Códigos de erro da edge function → mensagem PT amigável. */
export function mapAddCardError(code: string | undefined): string {
  switch (code) {
    case 'payment_platform_not_configured':
      return 'O pagamento ainda não está ativo na plataforma. Tente novamente mais tarde.';
    case 'idempotency_required':
    case 'invalid_setup_intent':
      return 'Não foi possível iniciar a tokenização do cartão. Tente novamente.';
    case 'setup_intent_not_succeeded':
      return 'Confirme o cartão antes de salvar.';
    case 'payment_method_not_card':
      return 'Use um cartão válido.';
    case 'stripe_error':
      return 'Não foi possível validar o cartão na Stripe.';
    case 'card_limit_reached':
      return 'Você atingiu o limite de cartões cadastrados.';
    case 'card_already_registered':
      return 'Este cartão já está cadastrado.';
    default:
      return 'Não foi possível cadastrar o cartão. Tente novamente.';
  }
}

async function readFunctionError(error: unknown): Promise<string | undefined> {
  try {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json();
      return body?.error;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function useStartStripeCardSetup() {
  return useMutation({
    mutationFn: async (input: { requestKey: string }): Promise<StripeSetupIntentStart> => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        setup_intent_id?: string;
        client_secret?: string;
        publishable_key?: string;
      }>('payment-stripe-setup-intent-start', { body: { request_key: input.requestKey } });
      if (error) throw new Error(mapAddCardError(await readFunctionError(error)));
      if (data?.ok !== true || !data.setup_intent_id || !data.client_secret || !data.publishable_key) {
        throw new Error(mapAddCardError(data?.error));
      }
      return {
        setupIntentId: data.setup_intent_id,
        clientSecret: data.client_secret,
        publishableKey: data.publishable_key,
      };
    },
  });
}

export function useSaveStripePaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: SaveStripeCardInput) => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        message?: string;
      }>('payment-stripe-card-save', {
        body: {
          setup_intent_id: input.setupIntentId,
          nickname: input.nickname,
        },
      });
      if (error) throw new Error(mapAddCardError(await readFunctionError(error)));
      if (data?.ok !== true) throw new Error(mapAddCardError(data?.error));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useSetDefaultCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('set_default_payment_card', { p_card_id: cardId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useRenamePaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: { cardId: string; nickname: string }) => {
      const { error } = await supabase.rpc('rename_payment_card', {
        p_card_id: input.cardId,
        p_nickname: input.nickname || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useDeletePaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('delete_payment_card', { p_card_id: cardId });
      if (error) {
        if (error.message.includes('default_card_delete_blocked')) {
          throw new Error('Defina outro cartão como principal antes de excluir este.');
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}
