import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, CreditCard, Loader2, QrCode, X } from 'lucide-react';
import { loadStripe, type StripeCheckoutElementsSdk, type StripePaymentElement } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/I18nProvider';

type BillingType = 'one_time' | 'recurring';
type Method = 'pix' | 'card';
type PaymentStatus = 'created' | 'pending' | 'confirmed' | 'settled' | 'failed' | 'refunded' | 'chargeback';

type CheckoutData = {
  transaction_id: string;
  client_secret?: string;
  publishable_key?: string;
  return_url?: string;
  pix_payload?: string | null;
  pix_qr_code_base64?: string | null;
  expires_at?: string | null;
};

interface TransparentCheckoutSheetProps {
  open: boolean;
  offeringId: string;
  billingType: BillingType;
  title: string;
  amountLabel: string;
  onClose: () => void;
  onConfirmed?: () => void;
}

const POLL_INTERVAL_MS = 3500;

function edgeType(billingType: BillingType): 'one_time' | 'subscription' {
  return billingType === 'recurring' ? 'subscription' : 'one_time';
}

/**
 * Reads one checkout row through get_my_checkout_status. The client has no SELECT
 * grant on payment_transactions — it was revoked on purpose in the financial ledger migration.
 */
async function fetchCheckoutStatus(transactionId: string) {
  const { data, error } = await supabase.rpc('get_my_checkout_status', { p_transaction_id: transactionId }) as {
    data: unknown;
    error: unknown;
  };
  if (error || !data || typeof data !== 'object') return null;
  return data as { status: PaymentStatus | null; settlement_status: string | null };
}

/**
 * Mounts the sheet body only while open, so all checkout state (intents, request
 * keys, Stripe element) is created and discarded with the sheet — no reset effect.
 */
export function TransparentCheckoutSheet({ open, ...props }: TransparentCheckoutSheetProps) {
  if (!open) return null;
  return <CheckoutSheetBody {...props} />;
}

function CheckoutSheetBody({
  offeringId,
  billingType,
  title,
  amountLabel,
  onClose,
  onConfirmed,
}: Omit<TransparentCheckoutSheetProps, 'open'>) {
  const { t, language } = useTranslation();
  /** PIX has no subscription behind it, so a recurring offering is card-only. */
  const pixAllowed = billingType !== 'recurring';
  const [method, setMethod] = useState<Method>(pixAllowed ? 'pix' : 'card');
  const [pixData, setPixData] = useState<CheckoutData | null>(null);
  const [cardData, setCardData] = useState<CheckoutData | null>(null);
  const [loadingMethod, setLoadingMethod] = useState<Method | null>(null);
  const [confirmingCard, setConfirmingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const stripeMountRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<StripeCheckoutElementsSdk | null>(null);
  const confirmedRef = useRef(false);
  /** Without this guard a failed start re-fires the effect forever and burns the 6/min rate limit. */
  const attemptedRef = useRef<Record<Method, boolean>>({ pix: false, card: false });
  /** Stable per method so a retry replays the same intent instead of opening a second charge. */
  const requestKeyRef = useRef<Record<Method, string | null>>({ pix: null, card: null });

  const data = method === 'card' ? cardData : pixData;
  const transactionId = cardData?.transaction_id ?? pixData?.transaction_id ?? null;

  const start = useCallback(async (nextMethod: Method) => {
    if (!offeringId) return;
    if (attemptedRef.current[nextMethod]) return;
    attemptedRef.current[nextMethod] = true;
    if (!requestKeyRef.current[nextMethod]) {
      requestKeyRef.current[nextMethod] = crypto.randomUUID();
    }
    setLoadingMethod(nextMethod);
    setError(null);
    try {
      const fn = nextMethod === 'card' ? 'payment-stripe-checkout-start' : 'payment-asaas-pix-start';
      const returnUrl = `${window.location.origin}/perfil/pagamentos?aba=pagamentos`;
      const { data: result, error: invokeError } = await supabase.functions.invoke(`${fn}?type=${edgeType(billingType)}`, {
        body: {
          offering_id: offeringId,
          request_key: requestKeyRef.current[nextMethod],
          return_url: returnUrl,
        },
      });
      if (invokeError) throw invokeError;
      if (!result?.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'checkout_failed');
      if (nextMethod === 'card') setCardData(result as CheckoutData);
      else setPixData(result as CheckoutData);
      setStatus('pending');
    } catch {
      setError(t('payments.checkout.startError'));
    } finally {
      setLoadingMethod(null);
    }
  }, [billingType, offeringId, t]);

  useEffect(() => {
    if (data) return;
    void start(method);
  }, [data, method, start]);

  useEffect(() => {
    if (method !== 'card' || !cardData?.client_secret || !cardData.publishable_key || !stripeMountRef.current) return;
    const { client_secret: clientSecret, publishable_key: publishableKey } = cardData;
    let cancelled = false;
    let element: StripePaymentElement | null = null;
    void (async () => {
      try {
        const stripe = await loadStripe(publishableKey);
        if (!stripe || cancelled || !stripeMountRef.current) return;
        // Pairs with ui_mode: 'elements' on the Checkout Session.
        const checkout = stripe.initCheckoutElementsSdk({ clientSecret });
        if (cancelled || !stripeMountRef.current) return;
        checkoutRef.current = checkout;
        element = checkout.createPaymentElement();
        element.mount(stripeMountRef.current);
      } catch {
        if (!cancelled) setError(t('payments.checkout.startError'));
      }
    })();
    return () => {
      cancelled = true;
      element?.destroy();
      checkoutRef.current = null;
    };
  }, [cardData, method, t]);

  const confirmed = status === 'confirmed' || status === 'settled';

  useEffect(() => {
    if (!transactionId || confirmed || status === 'failed') return;
    let active = true;
    const tick = async () => {
      const row = await fetchCheckoutStatus(transactionId);
      if (!active || !row) return;
      const next = (row.settlement_status === 'settled' ? 'settled' : row.status) as PaymentStatus | null;
      if (!next) return;
      setStatus(next);
      if (!confirmedRef.current && (next === 'confirmed' || next === 'settled')) {
        confirmedRef.current = true;
        onConfirmed?.();
      }
    };
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [confirmed, onConfirmed, status, transactionId]);

  const qrSrc = useMemo(() => {
    if (!pixData?.pix_qr_code_base64) return null;
    return pixData.pix_qr_code_base64.startsWith('data:')
      ? pixData.pix_qr_code_base64
      : `data:image/png;base64,${pixData.pix_qr_code_base64}`;
  }, [pixData]);

  async function copyPix() {
    if (!pixData?.pix_payload) return;
    try {
      await navigator.clipboard.writeText(pixData.pix_payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t('payments.checkout.copyError'));
    }
  }

  async function confirmCard() {
    setError(null);
    setConfirmingCard(true);
    try {
      const checkout = checkoutRef.current;
      if (!checkout) throw new Error('not_ready');
      // confirm() lives on the actions handle, not on the SDK instance.
      const actions = await checkout.loadActions();
      if (actions.type !== 'success') throw new Error(actions.error.message);
      // redirect: 'if_required' keeps 3DS in an on-page Stripe modal instead of
      // navigating away; only genuinely redirect-based methods leave the sheet.
      const result = await actions.actions.confirm({
        redirect: 'if_required',
      });
      if (result.type === 'error') throw new Error(result.error.message);
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : '';
      setError(message && message !== 'not_ready' && message !== 'stripe_error' ? message : t('payments.checkout.startError'));
    } finally {
      setConfirmingCard(false);
    }
  }

  const statusLabel = confirmed
    ? t('payments.checkout.confirmed')
    : status === 'failed'
      ? t('payments.checkout.statusFailed')
      : t('payments.checkout.statusWaiting');

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-end bg-black/45">
      <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-title text-on-surface">{title}</h2>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{amountLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('payments.checkout.close')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        {pixAllowed ? (
          <div className="mt-4 grid grid-cols-2 rounded-full bg-surface-container p-1">
            <button type="button" onClick={() => setMethod('pix')} className={`min-h-10 rounded-full font-sans text-label ${method === 'pix' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
              {t('payments.checkout.methodPix')}
            </button>
            <button type="button" onClick={() => setMethod('card')} className={`min-h-10 rounded-full font-sans text-label ${method === 'card' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
              {t('payments.checkout.methodCard')}
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-surface-container px-3 py-2 font-sans text-body-sm text-on-surface-variant">
            {t('payments.checkout.recurringCardOnly')}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-error-container px-3 py-2 font-sans text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-4">
          {loadingMethod === method ? (
            <div className="flex min-h-60 items-center justify-center"><Loader2 size={26} className="animate-spin text-primary" /></div>
          ) : method === 'pix' ? (
            <div className="space-y-3">
              <div className="flex justify-center rounded-2xl bg-surface-container p-4">
                {qrSrc
                  ? <img src={qrSrc} alt={t('payments.checkout.qrAlt')} className="size-56 rounded-xl bg-white p-2" />
                  : <QrCode size={96} className="text-on-surface-variant" />}
              </div>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface p-3">
                <p className="font-sans text-counter text-on-surface-variant">{t('payments.checkout.pasteLabel')}</p>
                <p className="mt-2 max-h-28 overflow-y-auto break-all font-sans text-body-sm text-on-surface">
                  {pixData?.pix_payload ?? t('payments.checkout.generating')}
                </p>
              </div>
              <button type="button" onClick={copyPix} disabled={!pixData?.pix_payload} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
                <Copy size={17} aria-hidden /> {copied ? t('payments.checkout.copied') : t('payments.checkout.copy')}
              </button>
              {pixData?.expires_at ? (
                <p className="font-sans text-counter text-on-surface-variant">
                  {t('payments.checkout.expiresAt', { date: new Date(pixData.expires_at).toLocaleString(language) })}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div ref={stripeMountRef} className="min-h-40 rounded-2xl border border-outline-variant/30 bg-surface p-3" />
              <button type="button" onClick={confirmCard} disabled={!cardData?.client_secret || confirmingCard || confirmed} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
                {confirmingCard ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <CreditCard size={17} aria-hidden />}
                {confirmed ? t('payments.checkout.confirmed') : t('payments.checkout.payCard')}
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 rounded-2xl bg-surface-container px-3 py-2 font-sans text-body-sm text-on-surface-variant" aria-live="polite">
          {statusLabel}
        </p>
        <p className="mt-2 font-sans text-counter text-on-surface-variant">{t('payments.checkout.autoConfirm')}</p>
      </section>
    </div>
  );
}
