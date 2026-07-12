import { supabase } from '@/lib/supabase';

/** Alinhado ao Signup v1: minúsculas, [a-z0-9_], truncado em 30. */
export function normalizeOnboardingUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
}

/**
 * Verifica se o username está livre (qualquer linha existente = indisponível).
 * Idêntico ao `checkUsernameAvailability` do v1.
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const normalized = normalizeOnboardingUsername(username);
  if (normalized.length < 3) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', normalized)
    .maybeSingle();

  if (error) return false;
  return !data;
}
