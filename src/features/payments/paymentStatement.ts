import type { PaymentTransaction } from './usePaymentTransactions';

// Resultado da cobrança na visão de quem pagou: a plataforma aprovou ou recusou.
// Estorno e contestação vieram de uma cobrança aprovada — continuam no balde
// `approved`, com o detalhe aparecendo em um chip secundário no cartão.
export type PaymentOutcome = 'approved' | 'declined' | 'pending';

export type PaymentOutcomeFilter = 'all' | 'approved' | 'declined';

export function paymentOutcome(transaction: PaymentTransaction): PaymentOutcome {
  const { status, settlement_status: settlement } = transaction;
  if (status === 'failed' || status === 'canceled') return 'declined';
  if (['confirmed', 'settled', 'refunded', 'chargeback'].includes(status)) return 'approved';
  if (['confirmed', 'settled', 'refunded', 'chargeback'].includes(settlement)) return 'approved';
  return 'pending';
}

/** Descrição legível da cobrança — é o que a busca por texto varre. */
export function paymentDescription(
  transaction: PaymentTransaction,
  fallback: { subscription: string; oneTime: string },
): string {
  const kind = transaction.billing_type === 'recurring' ? fallback.subscription : fallback.oneTime;
  const parts = [transaction.offering_name, transaction.professional_name].filter(Boolean);
  return parts.length ? parts.join(' · ') : kind;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca global do extrato: casa com os últimos dígitos do cartão, com o valor
 * (digitado como `19`, `19,90` ou `19.90`) ou com o texto da cobrança.
 */
export function matchesPaymentQuery(
  transaction: PaymentTransaction,
  query: string,
  description: string,
): boolean {
  const term = normalize(query);
  if (!term) return true;

  const haystack = [description, transaction.card_brand, transaction.card_last4]
    .filter(Boolean)
    .map((value) => normalize(String(value)));
  if (haystack.some((value) => value.includes(term))) return true;

  const digits = term.replace(/\D/g, '');
  if (digits) {
    if (transaction.card_last4?.includes(digits)) return true;
    const amount = Number(transaction.gross_value).toFixed(2).replace('.', '');
    if (amount.includes(digits)) return true;
  }

  return false;
}
