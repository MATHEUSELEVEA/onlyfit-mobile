// Regra de acesso de assinante — espelha o onlyfit v1: membership ativa,
// em trial, ou inadimplente dentro do período de carência ainda dá acesso.
export interface MembershipStatusRow {
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
}

export function isMembershipActive(row: MembershipStatusRow): boolean {
  if (row.status === 'active' || row.status === 'trialing') return true;
  if (row.status !== 'past_due') return false;
  const periodEnd = row.current_period_end ? new Date(row.current_period_end).getTime() : 0;
  const graceUntil = row.grace_until ? new Date(row.grace_until).getTime() : 0;
  return Math.max(periodEnd, graceUntil) > Date.now();
}
