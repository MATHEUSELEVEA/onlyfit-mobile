import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, CreditCard, Loader2, QrCode, X } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';

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

function edgeType(billingType: BillingType): 'one_time' | 'subscription' {
  return billingType === 'recurring' ? 'subscription' : 'one_time';
}

export function TransparentCheckoutSheet({
  open,
  offeringId,
  billingType,
  title,
  amountLabel,
  onClose,
  onConfirmed,
}: TransparentCheckoutSheetProps) {
  const [method, setMethod] = useState<Method>('pix');
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingCard, setConfirmingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const stripeMountRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<any>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setMethod('pix');
      setData(null);
      setLoading(false);
      setConfirmingCard(false);
      setError(null);
      setStatus(null);
      setCopied(false);
      checkoutRef.current = null;
      confirmedRef.current = false;
    }
  }, [open]);

  const start = useCallback(async (nextMethod: Method) => {
    if (!open || !offeringId) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    setData(null);
    try {
      const fn = nextMethod === 'card' ? 'payment-stripe-checkout-start' : 'payment-asaas-pix-start';
      const returnUrl = `${window.location.origin}/perfil/pagamentos?aba=pagamentos`;
      const { data: result, error: invokeError } = await supabase.functions.invoke(`${fn}?type=${edgeType(billingType)}`, {
        body: {
          offering_id: offeringId,
          request_key: crypto.randomUUID(),
          return_url: returnUrl,
        },
      });
      if (invokeError) throw invokeError;
      if (!result?.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'checkout_failed');
      setData(result as CheckoutData);
      setStatus('pending');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'checkout_failed');
    } finally {
      setLoading(false);
    }
  }, [billingType, offeringId, open]);

  useEffect(() => {
    if (!open || data || loading) return;
    void start(method);
  }, [data, loading, method, open, start]);

  useEffect(() => {
    if (!open || method !== 'card' || !data?.client_secret || !data.publishable_key || !stripeMountRef.current) return;
    let cancelled = false;
    let element: { mount?: (target: HTMLElement) => void; unmount?: () => void; destroy?: () => void } | null = null;
    void (async () => {
      try {
        const stripe = await loadStripe(data.publishable_key!);
        if (!stripe || cancelled || !stripeMountRef.current) return;
        const checkout = await (stripe as any).initCheckout({ clientSecret: data.client_secret });
        checkoutRef.current = checkout;
        element = checkout.createPaymentElement();
        element?.mount?.(stripeMountRef.current);
      } catch (mountError) {
        setError(mountError instanceof Error ? mountError.message : 'stripe_checkout_not_ready');
      }
    })();
    return () => {
      cancelled = true;
      element?.unmount?.();
      element?.destroy?.();
      checkoutRef.current = null;
    };
  }, [data, method, open]);

  useEffect(() => {
    if (!open || !data?.transaction_id) return;
    const timer = window.setInterval(async () => {
      const { data: row } = await supabase
        .from('payment_transactions')
        .select('status, settlement_status')
        .eq('id', data.transaction_id)
        .maybeSingle();
      const next = (row?.settlement_status === 'settled' ? 'settled' : row?.status) as PaymentStatus | undefined;
      if (!next) return;
      setStatus(next);
      if (!confirmedRef.current && ['confirmed', 'settled'].includes(next)) {
        confirmedRef.current = true;
        onConfirmed?.();
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [data?.transaction_id, onConfirmed, open]);

  const qrSrc = useMemo(() => {
    if (!data?.pix_qr_code_base64) return null;
    return data.pix_qr_code_base64.startsWith('data:')
      ? data.pix_qr_code_base64
      : `data:image/png;base64,${data.pix_qr_code_base64}`;
  }, [data]);

  async function copyPix() {
    if (!data?.pix_payload) return;
    try {
      await navigator.clipboard.writeText(data.pix_payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Não foi possível copiar o PIX.');
    }
  }

  async function confirmCard() {
    setError(null);
    setConfirmingCard(true);
    try {
      if (!checkoutRef.current?.confirm) throw new Error('stripe_checkout_not_ready');
      const result = await checkoutRef.current.confirm({ returnUrl: data?.return_url ?? `${window.location.origin}/perfil/pagamentos?aba=pagamentos` });
      if (result?.error) throw new Error(result.error.message ?? 'stripe_error');
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'stripe_error');
    } finally {
      setConfirmingCard(false);
    }
  }

  if (!open) return null;
  const confirmed = status === 'confirmed' || status === 'settled';

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45">
      <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-title text-on-surface">{title}</h2>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{amountLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="mt-4 grid grid-cols-2 rounded-full bg-surface-container p-1">
          <button type="button" onClick={() => { setMethod('pix'); void start('pix'); }} className={`min-h-10 rounded-full font-sans text-label ${method === 'pix' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
            PIX
          </button>
          <button type="button" onClick={() => { setMethod('card'); void start('card'); }} className={`min-h-10 rounded-full font-sans text-label ${method === 'card' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
            Cartão
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex min-h-60 items-center justify-center"><Loader2 size={26} className="animate-spin text-primary" /></div>
          ) : method === 'pix' ? (
            <div className="space-y-3">
              <div className="flex justify-center rounded-2xl bg-surface-container p-4">
                {qrSrc ? <img src={qrSrc} alt="QR Code PIX" className="size-56 rounded-xl bg-white p-2" /> : <QrCode size={96} className="text-on-surface-variant" />}
              </div>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface p-3">
                <p className="font-sans text-counter text-on-surface-variant">Copia e cola PIX</p>
                <p className="mt-2 max-h-28 overflow-y-auto break-all font-sans text-body-sm text-on-surface">{data?.pix_payload ?? 'Aguardando PIX.'}</p>
              </div>
              <button type="button" onClick={copyPix} disabled={!data?.pix_payload} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
                <Copy size={17} aria-hidden /> {copied ? 'Copiado' : 'Copiar PIX'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div ref={stripeMountRef} className="min-h-40 rounded-2xl border border-outline-variant/30 bg-surface p-3" />
              <button type="button" onClick={confirmCard} disabled={!data?.client_secret || confirmingCard || confirmed} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
                {confirmingCard ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <CreditCard size={17} aria-hidden />}
                {confirmed ? 'Confirmado' : 'Pagar com cartão'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 rounded-2xl bg-surface-container px-3 py-2 font-sans text-body-sm text-on-surface-variant">
          Status: {confirmed ? 'confirmado' : status === 'failed' ? 'falhou' : 'aguardando pagamento'}
        </p>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-error-container px-3 py-2 font-sans text-body-sm text-on-error-container">{error}</p>}
      </section>
    </div>
  );
}
