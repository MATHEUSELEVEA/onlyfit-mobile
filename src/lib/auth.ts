/**
 * Normaliza e-mail para auth: trim + lowercase.
 * Garante que signup/login funcionem independente de maiúsculas ou espaços
 * acidentais (o Supabase Auth pode tratar e-mail como case-sensitive).
 * Espelha o helper homônimo do v1.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Caminho interno seguro para `redirect_to` pós-confirmação de e-mail
 * (só paths que começam com `/`, evitando open-redirect).
 */
export function sanitizeInternalRedirectPath(
  next: string | null | undefined,
  fallback = '/feed',
): string {
  const t = (next ?? '').trim();
  if (!t.startsWith('/') || t.startsWith('//')) return fallback;
  return t;
}

/**
 * URL absoluta enviada ao Supabase em `emailRedirectTo` (signup, reenvio).
 * O domínio é o da app (`window.location.origin`); o link no e-mail cai em
 * `/auth/confirm`, que finaliza a verificação e redireciona para `redirect_to`.
 */
export function buildEmailConfirmRedirectUrl(redirectTo = '/feed'): string {
  const url = new URL('/auth/confirm', window.location.origin);
  const path = sanitizeInternalRedirectPath(redirectTo, '/feed');
  url.searchParams.set('redirect_to', path);
  return url.toString();
}
