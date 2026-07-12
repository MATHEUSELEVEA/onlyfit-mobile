import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { buildEmailConfirmRedirectUrl, normalizeEmail } from '@/lib/auth';

/** Metadados enviados no cadastro para o trigger de perfil (igual v1). */
export interface SignUpMetadata {
  full_name?: string;
  username?: string;
  country_code?: string;
  tax_id?: string;
  language?: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: SignUpMetadata,
    redirectTo?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signIn: async () => ({ error: 'AuthProvider ausente' }),
  signUp: async () => ({ error: 'AuthProvider ausente', needsConfirmation: false }),
  resetPassword: async () => ({ error: 'AuthProvider ausente' }),
  updatePassword: async () => ({ error: 'AuthProvider ausente' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  async function signUp(
    email: string,
    password: string,
    metadata?: SignUpMetadata,
    redirectTo = '/feed',
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildEmailConfirmRedirectUrl(redirectTo),
        // O trigger `sync_profile_contacts_from_auth_user` popula o perfil
        // a partir destes campos (username, full_name, country_code, language).
        data: metadata,
      },
    });
    return {
      error: error ? error.message : null,
      // Sem sessão imediata => o projeto exige confirmação de e-mail.
      needsConfirmation: !error && !data.session,
    };
  }

  /**
   * Envio do link de recuperação via edge function `send-password-reset`
   * (Admin API + Resend), exatamente como o v1 — o método nativo
   * `resetPasswordForEmail` foi abandonado lá por cair em filtro de spam.
   */
  async function resetPassword(email: string) {
    const normalized = normalizeEmail(email);
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { email: normalized },
    });

    const nested = (data as { error?: string } | null)?.error;
    if (error || nested) {
      let msg = 'Erro ao enviar e-mail. Tente novamente mais tarde.';
      if (error) {
        try {
          const bodyErr = (error as { context?: { json?: () => Promise<{ error?: string }> } })
            ?.context?.json;
          const parsed = bodyErr ? await bodyErr() : {};
          msg = parsed?.error || (error as Error).message || msg;
        } catch {
          msg = (error as Error).message || msg;
        }
      } else if (nested) {
        msg = nested;
      }
      return { error: msg };
    }

    return { error: null };
  }

  /** Define a nova senha do usuário na sessão de recuperação ativa. */
  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, signIn, signUp, resetPassword, updatePassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
