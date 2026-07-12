import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { sanitizeInternalRedirectPath } from '@/lib/auth';
import { BackgroundSlideshow } from '@/components/BackgroundSlideshow';

/**
 * Finaliza confirmação de e-mail / magic link no domínio do app (paridade com
 * o `/auth/confirm` do v1). Suporta: `?code=` (PKCE), `token_hash` + `type`,
 * e redirect implícito com tokens no hash (`#access_token…`).
 */
export function AuthConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const code = searchParams.get('code');
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const redirectTo = sanitizeInternalRedirectPath(searchParams.get('redirect_to'), '/feed');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';

    async function run() {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error) throw error;
          navigate(redirectTo, { replace: true });
          return;
        }

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (cancelled) return;
          if (error) throw error;
          navigate(type === 'recovery' ? '/reset-password' : redirectTo, { replace: true });
          return;
        }

        // Redirect implícito: tokens no fragmento da URL.
        if (hash.includes('access_token')) {
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (cancelled) return;
            if (error) throw error;
            const hashType = params.get('type');
            navigate(hashType === 'recovery' ? '/reset-password' : redirectTo, { replace: true });
            return;
          }
        }

        throw new Error('Link inválido ou expirado.');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Não foi possível confirmar o link.');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <BackgroundSlideshow />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        {status === 'loading' ? (
          <>
            <Loader2 size={40} className="animate-spin text-primary" aria-hidden />
            <p className="font-sans text-body text-white/70">Confirmando seu acesso…</p>
          </>
        ) : (
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <AlertCircle size={40} className="mx-auto text-error" aria-hidden />
            <h1 className="mt-4 font-sans text-title-lg text-white">Não foi possível confirmar</h1>
            <p className="mt-2 font-sans text-body-sm text-white/60">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="mt-6 w-full rounded-2xl bg-primary py-3 font-sans text-label text-on-primary transition-all active:scale-[0.98]"
            >
              Voltar para o login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
