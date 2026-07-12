import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { BackgroundSlideshow } from '@/components/BackgroundSlideshow';

/**
 * Conclui a recuperação de senha (paridade com o `/reset-password` do v1).
 * O link do e-mail traz `token_hash` + `type=recovery`: validamos o OTP para
 * abrir uma sessão de recuperação e então o usuário define a nova senha.
 */
export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;

    async function verify() {
      // Link customizado do e-mail (token_hash + type=recovery).
      if (tokenHash && type) {
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (cancelled) return;
        if (otpError) {
          setLinkValid(false);
          setError('Link inválido ou expirado. Solicite um novo pela tela de login.');
        } else {
          setLinkValid(true);
        }
        setVerifying(false);
        return;
      }

      // Fallback: redirect implícito já pode ter criado a sessão de recovery.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setLinkValid(true);
      } else {
        setLinkValid(false);
        setError('Link inválido ou expirado. Solicite um novo pela tela de login.');
      }
      setVerifying(false);
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);

    if (updateError) {
      setError('Não foi possível atualizar a senha. Tente novamente.');
      return;
    }

    setSuccess(true);
    await supabase.auth.signOut();
    window.setTimeout(() => navigate('/', { replace: true }), 2500);
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <BackgroundSlideshow />

      <div className="relative z-10 flex h-full flex-col overflow-y-auto no-scrollbar px-6 pb-safe-bottom pt-safe-top">
        <div className="animate-login-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-end pb-10 pt-16">
          <header className="mb-8">
            <h1 className="font-sans text-5xl font-extrabold leading-none tracking-tight text-white">
              Only<span className="text-primary">Fit</span>
            </h1>
            <p className="mt-3 max-w-[16rem] font-sans text-body text-white/70">
              Defina uma nova senha para proteger sua conta.
            </p>
          </header>

          <div className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            {verifying ? (
              <div className="flex items-center justify-center gap-2 py-8 text-white/70">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                <span className="font-sans text-body-sm">Validando link…</span>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 size={40} className="text-primary" aria-hidden />
                <p className="font-sans text-title-lg text-white">Senha atualizada!</p>
                <p className="font-sans text-body-sm text-white/60">
                  Redirecionando para o login…
                </p>
              </div>
            ) : linkValid ? (
              <>
                <div className="mb-5">
                  <h2 className="font-sans text-title-lg text-white">Nova senha</h2>
                  <p className="mt-1 font-sans text-body-sm text-white/60">
                    Crie uma senha forte com ao menos 6 caracteres.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                  <Field icon={<Lock size={18} />} label="Nova senha">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent font-sans text-body text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="ml-2 shrink-0 text-white/50 transition-colors hover:text-white"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </Field>

                  <Field icon={<Lock size={18} />} label="Confirmar senha">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-transparent font-sans text-body text-white placeholder:text-white/35 outline-none"
                    />
                  </Field>

                  {error && (
                    <p role="alert" className="font-sans text-body-sm text-error">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary font-sans text-label text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {submitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
                    Salvar nova senha
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <p className="font-sans text-title-lg text-white">Link inválido</p>
                <p className="font-sans text-body-sm text-white/60">{error}</p>
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="mt-2 w-full rounded-2xl bg-primary py-3 font-sans text-label text-on-primary transition-all active:scale-[0.98]"
                >
                  Voltar para o login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/20 px-4 py-3.5 transition-colors focus-within:border-primary/70 focus-within:bg-black/30">
      <span className="shrink-0 text-white/50" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}
