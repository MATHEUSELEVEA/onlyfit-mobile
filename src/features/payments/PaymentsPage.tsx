import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CircleCheckBig,
  Clock3,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
  Repeat,
  Search,
  Star,
  Trash2,
  Undo2,
  CircleX,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import { AddCardSheet } from './AddCardSheet';
import {
  usePaymentCards,
  useDeletePaymentCard,
  useSetDefaultCard,
  type PaymentCard,
} from './usePaymentCards';
import { usePaymentTransactions, type PaymentTransaction } from './usePaymentTransactions';
import { usePaymentSubscriptions, type PaymentSubscription } from './usePaymentSubscriptions';
import {
  matchesPaymentQuery,
  paymentDescription,
  paymentOutcome,
  type PaymentOutcome,
  type PaymentOutcomeFilter,
} from './paymentStatement';
import { useCancelSubscription, useRefundTransaction, isWithinRefundWindow } from './usePaymentActions';

type PaymentsTab = 'cartoes' | 'assinaturas' | 'pagamentos';

const TAB_PARAMS: Record<PaymentsTab, string> = {
  cartoes: 'cartoes',
  assinaturas: 'assinaturas',
  pagamentos: 'pagamentos',
};

function formatBRL(value: number | string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('aba');
  const tab: PaymentsTab =
    param === 'pagamentos' ? 'pagamentos' : param === 'assinaturas' ? 'assinaturas' : 'cartoes';
  const shouldOpenAddCard = searchParams.get('adicionarCartao') === '1';

  const setTab = (next: PaymentsTab) =>
    setSearchParams(next === 'cartoes' ? {} : { aba: TAB_PARAMS[next] }, { replace: true });

  function clearAddCardIntent() {
    const next = new URLSearchParams(searchParams);
    next.delete('adicionarCartao');
    setSearchParams(next, { replace: true });
  }

  const tabs: ReadonlyArray<{ key: PaymentsTab; label: string }> = [
    { key: 'cartoes', label: t('payments.tab.cards') },
    { key: 'assinaturas', label: t('payments.tab.subscriptions') },
    { key: 'pagamentos', label: t('payments.tab.history') },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-0 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3 pb-3">
            <Link
              to="/perfil/menu"
              aria-label={t('payments.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('payments.title')}</h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('payments.subtitle')}</p>
            </div>
          </div>

          <div className="grid grid-cols-3" role="tablist" aria-label={t('payments.title')}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  'relative min-h-[40px] whitespace-nowrap pb-2 font-sans text-label transition-colors',
                  tab === key ? 'text-on-surface' : 'text-on-surface-variant',
                )}
              >
                {label}
                {tab === key && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="px-4 pt-4">
          {tab === 'cartoes' && (
            <CardsTab openAddCard={shouldOpenAddCard} onOpenAddCardHandled={clearAddCardIntent} />
          )}
          {tab === 'assinaturas' && <SubscriptionsTab />}
          {tab === 'pagamentos' && <HistoryTab />}
        </main>
      </div>
    </div>
  );
}

function CardsTab({
  openAddCard,
  onOpenAddCardHandled,
}: {
  openAddCard: boolean;
  onOpenAddCardHandled: () => void;
}) {
  const { t } = useTranslation();
  const { data: cards = [], isLoading, isError } = usePaymentCards();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!openAddCard) return;
    const timeout = window.setTimeout(() => {
      setSheetOpen(true);
      onOpenAddCardHandled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [openAddCard, onOpenAddCardHandled]);

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98]"
      >
        <Plus size={18} aria-hidden />
        {t('payments.card.add')}
      </button>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 size={26} className="animate-spin text-primary" aria-label={t('payments.loading')} />
        </div>
      ) : isError ? (
        <p role="alert" className="rounded-2xl bg-error-container p-4 font-sans text-body-sm text-on-error-container">
          {t('payments.card.loadError')}
        </p>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('payments.card.emptyTitle')}
          description={t('payments.card.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <CardRow key={card.id} card={card} />
          ))}
          <p className="px-1 font-sans text-body-sm text-on-surface-variant">{t('payments.card.defaultHint')}</p>
        </div>
      )}

      <AddCardSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </section>
  );
}

function CardRow({ card }: { card: PaymentCard }) {
  const { t } = useTranslation();
  const setDefault = useSetDefaultCard();
  const deleteCard = useDeletePaymentCard();
  const [error, setError] = useState<string | null>(null);

  const busy = setDefault.isPending || deleteCard.isPending;
  const label = card.nickname || card.brand || t('payments.card.genericBrand');

  function handleDelete() {
    setError(null);
    if (!window.confirm(t('payments.card.deleteConfirm'))) return;
    deleteCard.mutate(card.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.card.actionError')),
    });
  }

  function handleSetDefault() {
    setError(null);
    setDefault.mutate(card.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.card.actionError')),
    });
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CreditCard size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-body font-medium text-on-surface">{label}</span>
            {card.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-sans text-counter text-primary">
                <Star size={12} aria-hidden />
                {t('payments.card.default')}
              </span>
            )}
          </div>
          <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
            •••• {card.last4}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!card.isDefault && (
          <button
            type="button"
            onClick={handleSetDefault}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
          >
            {setDefault.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Star size={15} aria-hidden />}
            {t('payments.card.makeDefault')}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          aria-label={t('payments.card.delete')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-error-container px-3 font-sans text-label text-on-error-container transition-colors active:opacity-80 disabled:opacity-60"
        >
          {deleteCard.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Trash2 size={15} aria-hidden />}
          {t('payments.card.delete')}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 font-sans text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

function SubscriptionsTab() {
  const { t } = useTranslation();
  const { data: subscriptions = [], isLoading, isError } = usePaymentSubscriptions();

  if (isLoading)
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 size={26} className="animate-spin text-primary" aria-label={t('payments.loading')} />
      </div>
    );
  if (isError)
    return (
      <p role="alert" className="rounded-2xl bg-error-container p-4 font-sans text-body-sm text-on-error-container">
        {t('payments.subscriptions.loadError')}
      </p>
    );
  if (!subscriptions.length)
    return (
      <EmptyState
        icon={Repeat}
        title={t('payments.subscriptions.emptyTitle')}
        description={t('payments.subscriptions.emptyDescription')}
      />
    );

  return (
    <section className="space-y-3">
      {subscriptions.map((subscription) => (
        <SubscriptionRow key={subscription.id} subscription={subscription} />
      ))}
    </section>
  );
}

function SubscriptionRow({ subscription }: { subscription: PaymentSubscription }) {
  const { t } = useTranslation();
  const cancelSubscription = useCancelSubscription();
  const [error, setError] = useState<string | null>(null);

  const cycleLabels: Record<string, string> = {
    MONTHLY: t('payments.subscriptions.cycle.monthly'),
    BIMONTHLY: t('payments.subscriptions.cycle.bimonthly'),
    QUARTERLY: t('payments.subscriptions.cycle.quarterly'),
    SEMIANNUALLY: t('payments.subscriptions.cycle.semiannually'),
    YEARLY: t('payments.subscriptions.cycle.yearly'),
  };
  const statusLabels: Record<string, string> = {
    active: t('payments.subscriptions.status.active'),
    inactive: t('payments.subscriptions.status.inactive'),
    canceled: t('payments.subscriptions.status.canceled'),
    expired: t('payments.subscriptions.status.expired'),
    past_due: t('payments.subscriptions.status.pastDue'),
  };

  const active = subscription.status === 'active' || subscription.status === 'past_due';
  const title =
    subscription.offering_name || subscription.professional_name || t('payments.history.subscription');

  function handleCancel() {
    setError(null);
    if (!window.confirm(t('payments.history.cancelConfirm'))) return;
    cancelSubscription.mutate(subscription.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.history.actionError')),
    });
  }

  return (
    <article className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Repeat size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-body font-medium text-on-surface">{title}</p>
          {subscription.professional_name && subscription.offering_name && (
            <p className="truncate font-sans text-body-sm text-on-surface-variant">
              {subscription.professional_name}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-sans text-body font-semibold text-on-surface">{formatBRL(subscription.value)}</p>
          <span className="font-sans text-counter text-on-surface-variant">
            {cycleLabels[subscription.cycle] ?? subscription.cycle}
          </span>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-sans text-body-sm text-on-surface-variant">
            {t('payments.subscriptions.statusLabel')}
          </dt>
          <dd
            className={clsx(
              'font-sans text-label',
              active ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            {statusLabels[subscription.status] ?? subscription.status}
          </dd>
        </div>
        {subscription.next_due_date && active && (
          <div className="flex items-center justify-between gap-3">
            <dt className="font-sans text-body-sm text-on-surface-variant">
              {t('payments.subscriptions.nextCharge')}
            </dt>
            <dd className="font-sans text-body-sm text-on-surface">
              {new Date(`${subscription.next_due_date}T00:00:00`).toLocaleDateString()}
            </dd>
          </div>
        )}
        {subscription.card_last4 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="font-sans text-body-sm text-on-surface-variant">
              {t('payments.subscriptions.chargedTo')}
            </dt>
            <dd className="font-sans text-body-sm text-on-surface">
              {subscription.card_brand ? `${subscription.card_brand} ` : ''}•••• {subscription.card_last4}
            </dd>
          </div>
        )}
      </dl>

      {active && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelSubscription.isPending}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
        >
          {cancelSubscription.isPending ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Ban size={15} aria-hidden />
          )}
          {t('payments.history.cancelSubscription')}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 font-sans text-body-sm text-error">
          {error}
        </p>
      )}
    </article>
  );
}

function HistoryTab() {
  const { t } = useTranslation();
  const { data: transactions = [], isLoading, isError } = usePaymentTransactions();
  const [outcomeFilter, setOutcomeFilter] = useState<PaymentOutcomeFilter>('all');
  const [query, setQuery] = useState('');

  const fallback = useMemo(
    () => ({ subscription: t('payments.history.subscription'), oneTime: t('payments.history.oneTime') }),
    [t],
  );

  const filtered = useMemo(
    () =>
      transactions.filter((transaction) => {
        const outcome = paymentOutcome(transaction);
        if (outcomeFilter !== 'all' && outcome !== outcomeFilter) return false;
        return matchesPaymentQuery(transaction, query, paymentDescription(transaction, fallback));
      }),
    [transactions, outcomeFilter, query, fallback],
  );

  const filters: ReadonlyArray<{ key: PaymentOutcomeFilter; label: string }> = [
    { key: 'all', label: t('payments.history.filter.all') },
    { key: 'approved', label: t('payments.history.filter.approved') },
    { key: 'declined', label: t('payments.history.filter.declined') },
  ];

  if (isLoading)
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 size={26} className="animate-spin text-primary" aria-label={t('payments.loading')} />
      </div>
    );
  if (isError)
    return (
      <p role="alert" className="rounded-2xl bg-error-container p-4 font-sans text-body-sm text-on-error-container">
        {t('payments.history.loadError')}
      </p>
    );
  if (!transactions.length)
    return (
      <EmptyState
        icon={ReceiptText}
        title={t('payments.history.emptyTitle')}
        description={t('payments.history.emptyDescription')}
      />
    );

  return (
    <section className="space-y-3">
      <label className="flex min-h-11 items-center gap-2 rounded-full bg-surface-container px-4">
        <Search size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('payments.history.searchPlaceholder')}
          aria-label={t('payments.history.searchLabel')}
          className="min-w-0 flex-1 bg-transparent font-sans text-body text-on-surface outline-none placeholder:text-on-surface-variant"
        />
      </label>

      <div className="flex gap-2" role="group" aria-label={t('payments.history.filter.label')}>
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={outcomeFilter === key}
            onClick={() => setOutcomeFilter(key)}
            className={clsx(
              'min-h-9 flex-1 rounded-full px-3 font-sans text-label transition-colors',
              outcomeFilter === key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('payments.history.noResultsTitle')}
          description={t('payments.history.noResultsDescription')}
        />
      ) : (
        filtered.map((transaction) => (
          <PaymentRow
            key={transaction.id}
            transaction={transaction}
            description={paymentDescription(transaction, fallback)}
          />
        ))
      )}
    </section>
  );
}

function OutcomeBadge({ outcome }: { outcome: PaymentOutcome }) {
  const { t } = useTranslation();
  const config = {
    approved: {
      icon: CircleCheckBig,
      label: t('payments.history.outcome.approved'),
      className: 'bg-primary/15 text-primary',
    },
    declined: {
      icon: CircleX,
      label: t('payments.history.outcome.declined'),
      className: 'bg-error-container text-on-error-container',
    },
    pending: {
      icon: Clock3,
      label: t('payments.history.outcome.pending'),
      className: 'bg-surface-container-high text-on-surface-variant',
    },
  }[outcome];
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-counter',
        config.className,
      )}
    >
      <Icon size={13} aria-hidden />
      {config.label}
    </span>
  );
}

function PaymentRow({
  transaction,
  description,
}: {
  transaction: PaymentTransaction;
  description: string;
}) {
  const { t } = useTranslation();
  const refundTransaction = useRefundTransaction();
  const [error, setError] = useState<string | null>(null);

  const outcome = paymentOutcome(transaction);
  const statusKey = transaction.settlement_status || transaction.status;
  const detailLabels: Record<string, string> = {
    settled: t('payments.history.status.settled'),
    refunded: t('payments.history.status.refunded'),
    chargeback: t('payments.history.status.chargeback'),
  };
  // Só vale mostrar o detalhe quando ele diz algo além do "aprovado/recusado".
  const detail = detailLabels[transaction.status] ?? detailLabels[statusKey];

  const canRefund =
    transaction.billing_type === 'one_time' &&
    ['confirmed', 'settled'].includes(statusKey) &&
    transaction.status !== 'refunded' &&
    isWithinRefundWindow(transaction.created_at);

  function handleRefund() {
    setError(null);
    if (!window.confirm(t('payments.history.refundConfirm'))) return;
    refundTransaction.mutate(transaction.id, {
      onError: (mutationError) =>
        setError(mutationError instanceof Error ? mutationError.message : t('payments.history.actionError')),
    });
  }

  return (
    <article className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {transaction.billing_type === 'recurring' ? (
            <Repeat size={18} aria-hidden />
          ) : (
            <ReceiptText size={18} aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-body font-medium text-on-surface">{description}</p>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
            {new Date(transaction.created_at).toLocaleDateString()}
            {transaction.card_last4
              ? ` · •••• ${transaction.card_last4}`
              : transaction.payment_method === 'pix'
                ? ` · ${t('payments.checkout.methodPix')}`
                : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-sans text-body font-semibold text-on-surface">
            {formatBRL(transaction.gross_value)}
          </p>
          <span className="font-sans text-counter text-on-surface-variant">
            {transaction.billing_type === 'recurring'
              ? t('payments.history.subscription')
              : t('payments.history.oneTime')}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={outcome} />
        {detail && (
          <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-0.5 font-sans text-counter text-on-surface-variant">
            {detail}
          </span>
        )}
        {canRefund && (
          <button
            type="button"
            onClick={handleRefund}
            disabled={refundTransaction.isPending}
            className="ml-auto inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-surface-container px-3 font-sans text-label text-on-surface transition-colors active:bg-surface-container-high disabled:opacity-60"
          >
            {refundTransaction.isPending ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Undo2 size={15} aria-hidden />
            )}
            {t('payments.history.requestRefund')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 font-sans text-body-sm text-error">
          {error}
        </p>
      )}
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CreditCard;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container/40 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon size={22} aria-hidden />
      </span>
      <div>
        <p className="font-sans text-body font-medium text-on-surface">{title}</p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}
