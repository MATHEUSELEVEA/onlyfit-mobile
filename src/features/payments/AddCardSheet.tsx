import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  loadStripe,
  type Stripe,
  type StripeElements,
  type StripePaymentElement,
} from '@stripe/stripe-js';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextField } from '@/components/ui/TextField';
import { useTranslation } from '@/i18n/I18nProvider';
import { useSaveStripePaymentCard, useStartStripeCardSetup } from './usePaymentCards';

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
}

function newRequestKey(): string {
  return `card_setup_${crypto.randomUUID()}`;
}

export function AddCardSheet({ open, onClose }: AddCardSheetProps) {
  const { t } = useTranslation();
  const startSetup = useStartStripeCardSetup();
  const saveCard = useSaveStripePaymentCard();

  const mountRef = useRef<HTMLDivElement | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const setupIntentIdRef = useRef<string | null>(null);
  const requestKeyRef = useRef<string>(newRequestKey());

  const [nickname, setNickname] = useState('');
  const [loadingElement, setLoadingElement] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loadingElement || startSetup.isPending || saveCard.isPending;
  const canSubmit = useMemo(() => ready && !busy, [busy, ready]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function mountStripeElement() {
      setError(null);
      setReady(false);
      setLoadingElement(true);
      try {
        const setup = await startSetup.mutateAsync({ requestKey: requestKeyRef.current });
        if (cancelled || !mountRef.current) return;
        setupIntentIdRef.current = setup.setupIntentId;

        const stripe = await loadStripe(setup.publishableKey);
        if (!stripe || cancelled || !mountRef.current) return;
        stripeRef.current = stripe;

        const elements = stripe.elements({ clientSecret: setup.clientSecret });
        elementsRef.current = elements;

        const paymentElement = elements.create('payment', {
          fields: { billingDetails: { name: 'auto', email: 'auto' } },
          layout: 'tabs',
        });
        paymentElement.on('ready', () => {
          if (!cancelled) setReady(true);
        });
        paymentElement.mount(mountRef.current);
        paymentElementRef.current = paymentElement;
      } catch (setupError) {
        if (!cancelled) {
          setError(setupError instanceof Error ? setupError.message : t('payments.card.form.invalid'));
        }
      } finally {
        if (!cancelled) setLoadingElement(false);
      }
    }

    void mountStripeElement();
    return () => {
      cancelled = true;
      paymentElementRef.current?.destroy();
      paymentElementRef.current = null;
      stripeRef.current = null;
      elementsRef.current = null;
      setupIntentIdRef.current = null;
    };
  // Mount once per sheet open; mutation objects update during their own loading state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setNickname('');
    setError(null);
    setReady(false);
    requestKeyRef.current = newRequestKey();
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !setupIntentIdRef.current) {
      setError(t('payments.card.form.invalid'));
      return;
    }

    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
          payment_method_data: { allow_redisplay: 'always' },
        },
        redirect: 'if_required',
      });
      if (result.error) throw new Error(result.error.message || t('payments.card.form.invalid'));

      const setupIntentId = result.setupIntent?.id ?? setupIntentIdRef.current;
      await saveCard.mutateAsync({
        setupIntentId,
        nickname: nickname.trim() || undefined,
      });
      reset();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('payments.card.form.invalid'));
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={t('payments.card.form.title')}
      description={t('payments.card.form.subtitle')}
      panelClassName="h-[76%]"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-2">
        <div className="min-h-40 rounded-2xl border border-outline-variant/30 bg-surface p-3">
          <div ref={mountRef} />
          {loadingElement && (
            <div className="flex min-h-32 items-center justify-center">
              <Loader2 size={22} className="animate-spin text-primary" aria-label={t('payments.loading')} />
            </div>
          )}
        </div>

        <TextField
          label={t('payments.card.form.nickname')}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={40}
          hint={t('payments.card.form.nicknameHint')}
        />

        <p className="font-sans text-body-sm text-on-surface-variant">{t('payments.card.form.security')}</p>

        {error && (
          <p role="alert" className="font-sans text-body-sm text-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? t('payments.card.form.saving') : t('payments.card.form.submit')}
        </button>
      </div>
    </BottomSheet>
  );
}
