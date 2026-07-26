import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  Bandage,
  BrainCircuit,
  ChevronRight,
  ClipboardList,
  FileHeart,
  FilePlus2,
  HeartPulse,
  Loader2,
  LockKeyhole,
  Pill,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { FeedbackMessage, HealthIcon, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { healthCategoryLabels, type HealthCategory, type HealthEvent } from './types';
import { useHealthConsents, useHealthEvents, useRecordHealthConsent } from './useHealthProfile';

const PROFILE_CONSENT =
  'Autorizo o tratamento das informações que eu registrar para criar e manter minha Ficha de saúde no OnlyFit.';
const AI_CONSENT =
  'Autorizo o uso de inteligência artificial quando eu escolher conversa assistida, transcrição de áudio ou análise de PDF.';

const categoryIcons: Record<HealthCategory, LucideIcon> = {
  anamnesis: ClipboardList,
  condition: HeartPulse,
  procedure: Stethoscope,
  injury: Bandage,
  exam: FileHeart,
  medication: Pill,
  allergy: AlertCircle,
  vaccine: Syringe,
  symptom: Activity,
  physical_assessment: BadgeCheck,
  habit: HeartPulse,
  other: FilePlus2,
};

export function HealthProfilePage() {
  return <HealthProfileView />;
}

/// Ficha de saúde: anamnese + histórico. Em `embedded` vive dentro da aba
/// "Ficha de saúde" de /meu-fit/saude, sem cabeçalho nem botão de novo registro.
export function HealthProfileView({ embedded = false, onAddRecord }: { embedded?: boolean; onAddRecord?: () => void }) {
  const location = useLocation();
  const [category, setCategory] = useState<HealthCategory | 'all'>('all');
  const { data: consents = [], isLoading: consentsLoading, isError: consentsError, refetch: refetchConsents } =
    useHealthConsents();
  const profileConsent = consents.find((consent) => consent.purpose === 'profile_storage');
  const hasProfileConsent = profileConsent?.action === 'granted';

  if (consentsLoading) {
    return (
      <ProfileShell embedded={embedded} title="Ficha de saúde" description="Carregando suas informações">
        <LoadingRows />
      </ProfileShell>
    );
  }

  if (consentsError) {
    return (
      <ProfileShell embedded={embedded} title="Ficha de saúde">
        <FeedbackMessage type="error">Não foi possível verificar suas permissões de saúde.</FeedbackMessage>
        <button
          type="button"
          onClick={() => void refetchConsents()}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary"
        >
          <RefreshCw size={17} aria-hidden /> Tentar novamente
        </button>
      </ProfileShell>
    );
  }

  if (!hasProfileConsent) return <HealthConsentIntro embedded={embedded} />;

  return (
    <HealthProfileContent
      category={category}
      setCategory={setCategory}
      success={embedded ? undefined : location.state?.success}
      embedded={embedded}
      onAddRecord={onAddRecord}
    />
  );
}

// Casca da ficha: página inteira na rota própria, apenas o conteúdo quando
// embutida em uma aba.
function ProfileShell({ embedded, title, description, width = 'wide', actions, children }: {
  embedded: boolean;
  title: string;
  description?: string;
  width?: 'wide' | 'form';
  actions?: ReactNode;
  children: ReactNode;
}) {
  if (embedded) return <div className="px-4 py-5">{children}</div>;
  return (
    <HealthPageShell width={width}>
      <HealthPageHeader title={title} description={description} backTo="/perfil" actions={actions} />
      <main className="px-4 py-6">{children}</main>
    </HealthPageShell>
  );
}

function HealthConsentIntro({ embedded }: { embedded: boolean }) {
  const [profileChecked, setProfileChecked] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const [error, setError] = useState('');
  const recordConsent = useRecordHealthConsent();

  async function continueToProfile() {
    if (!profileChecked) {
      setError('Confirme o uso dos dados para criar sua Ficha de saúde.');
      return;
    }
    setError('');
    try {
      if (aiChecked) {
        await recordConsent.mutateAsync({ purpose: 'ai_assistance', action: 'granted', statement: AI_CONSENT });
      }
      // O consentimento essencial vem por último: ao registrá-lo, a tela de
      // introdução pode desmontar imediatamente após o refetch do React Query.
      await recordConsent.mutateAsync({ purpose: 'profile_storage', action: 'granted', statement: PROFILE_CONSENT });
    } catch {
      setError('Não foi possível registrar sua escolha. Tente novamente.');
    }
  }

  return (
    <ProfileShell embedded={embedded} width="form" title="Ficha de saúde" description="Seus dados, sob seu controle">
      <div className="space-y-6">
        <section className="space-y-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck size={24} aria-hidden />
          </span>
          <div>
            <h2 className="font-sans text-title text-on-surface">Uma memória privada da sua saúde</h2>
            <p className="mt-2 max-w-[65ch] font-sans text-body text-on-surface-variant">
              Registre sua anamnese, informações clínicas e exames. O histórico confirmado não é editado:
              quando algo mudar, você adiciona uma correção e mantém a rastreabilidade.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-primary/30 bg-primary/5">
          <div className="flex gap-3 px-4 py-4">
            <HealthIcon icon={LockKeyhole} />
            <div>
              <h3 className="font-sans text-body font-semibold text-on-surface">Uso essencial</h3>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                Necessário para guardar e mostrar somente a você os dados que registrar.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-3 border-t border-outline-variant/25 px-4 py-4">
            <input
              type="checkbox"
              checked={profileChecked}
              onChange={(event) => setProfileChecked(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
            />
            <span className="font-sans text-body text-on-surface">{PROFILE_CONSENT}</span>
          </label>
        </section>

        <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface">
          <div className="flex gap-3 px-4 py-4">
            <HealthIcon icon={BrainCircuit} />
            <div>
              <h3 className="font-sans text-body font-semibold text-on-surface">Recursos com IA, opcionais</h3>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                Texto digitado e questionário normal funcionam sem IA. Você pode mudar esta escolha depois.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-3 border-t border-outline-variant/25 px-4 py-4">
            <input
              type="checkbox"
              checked={aiChecked}
              onChange={(event) => setAiChecked(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
            />
            <span className="font-sans text-body text-on-surface">{AI_CONSENT}</span>
          </label>
        </section>

        <p className="font-sans text-body-sm text-on-surface-variant">
          Compartilhamento com profissionais e uso para analytics permanecem desativados nesta versão.
        </p>
        {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
        <button
          type="button"
          onClick={() => void continueToProfile()}
          disabled={recordConsent.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {recordConsent.isPending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <ShieldCheck size={17} aria-hidden />}
          {recordConsent.isPending ? 'Registrando escolhas...' : 'Criar minha Ficha de saúde'}
        </button>
      </div>
    </ProfileShell>
  );
}

function HealthProfileContent({
  category,
  setCategory,
  success,
  embedded,
  onAddRecord,
}: {
  category: HealthCategory | 'all';
  setCategory: (category: HealthCategory | 'all') => void;
  success?: string;
  embedded: boolean;
  onAddRecord?: () => void;
}) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useHealthEvents(category);
  const { data: anamnesisData } = useHealthEvents('anamnesis');
  const events = useMemo(() => data?.pages.flat() ?? [], [data]);
  const latestAnamnesis = useMemo(
    () => anamnesisData?.pages.flat().find((event) => event.eventType === 'questionnaire_response'),
    [anamnesisData],
  );

  return (
    <ProfileShell
      embedded={embedded}
      width="form"
      title="Ficha de saúde"
      description="Declarações, registros clínicos e exames"
      actions={
        <Link
          to="/perfil/saude/novo"
          aria-label="Adicionar registro de saúde"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus size={20} aria-hidden />
        </Link>
      }
    >
      <div className="space-y-7">
        {success ? <FeedbackMessage type="success">{success}</FeedbackMessage> : null}

        <section className="overflow-hidden rounded-2xl bg-surface-container-low">
          <div className="flex items-start gap-3 px-4 py-4">
            <HealthIcon icon={ClipboardList} />
            <div className="min-w-0 flex-1">
              <h2 className="font-sans text-title text-on-surface">Sua anamnese</h2>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {latestAnamnesis
                  ? `Respondida em ${formatDate(latestAnamnesis.effectiveAt)}. Uma nova resposta preserva a anterior.`
                  : 'Registre seu histórico geral de saúde em cerca de 8 minutos.'}
              </p>
            </div>
          </div>
          <Link
            to="/perfil/saude/anamnese/questionario"
            className="flex min-h-12 items-center justify-between border-t border-outline-variant/25 px-4 font-sans text-label text-primary transition-colors active:bg-surface-container"
          >
            {latestAnamnesis ? 'Responder novamente' : 'Responder anamnese'}
            <ChevronRight size={18} aria-hidden />
          </Link>
        </section>

        <section>
          <div>
            <h2 className="font-sans text-title text-on-surface">Histórico de saúde</h2>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              Somente registros confirmados aparecem aqui.
            </p>
          </div>

          <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              <FilterButton selected={category === 'all'} onClick={() => setCategory('all')}>Todos</FilterButton>
              {(Object.entries(healthCategoryLabels) as [HealthCategory, string][]).map(([value, label]) => (
                <FilterButton key={value} selected={category === value} onClick={() => setCategory(value)}>
                  {label}
                </FilterButton>
              ))}
            </div>
          </div>

          <div className="mt-3 divide-y divide-outline-variant/25">
            {isLoading ? <LoadingRows /> : null}
            {isError ? (
              <div className="py-5">
                <FeedbackMessage type="error">Não foi possível carregar seu histórico.</FeedbackMessage>
                <button type="button" onClick={() => void refetch()} className="mt-3 inline-flex min-h-11 items-center font-sans text-label text-primary">
                  Tentar novamente
                </button>
              </div>
            ) : null}
            {!isLoading && !isError && events.length === 0 ? <HealthEmptyState onAddRecord={onAddRecord} /> : null}
            {events.map((event) => <HealthEventRow key={event.id} event={event} />)}
          </div>

          {hasNextPage ? (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface disabled:opacity-60"
            >
              {isFetchingNextPage ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
              {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
            </button>
          ) : null}
        </section>
      </div>
    </ProfileShell>
  );
}

function FilterButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'min-h-11 rounded-full px-3 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant',
      )}
    >
      {children}
    </button>
  );
}

function HealthEventRow({ event }: { event: HealthEvent }) {
  const Icon = categoryIcons[event.category];
  return (
    <Link to={`/perfil/saude/eventos/${event.id}`} className="flex gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <HealthIcon icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-sans text-body font-semibold text-on-surface">{event.title}</span>
          {event.correctsEventId ? (
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-sans text-counter text-on-surface-variant">Correção</span>
          ) : null}
        </span>
        <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
          {healthCategoryLabels[event.category]} · {formatDate(event.effectiveAt)}
        </span>
        {event.narrative ? (
          <span className="mt-1 line-clamp-2 block font-sans text-body-sm text-on-surface-variant">{event.narrative}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="mt-2 shrink-0 text-outline" aria-hidden />
    </Link>
  );
}

function HealthEmptyState({ onAddRecord }: { onAddRecord?: () => void }) {
  return (
    <div className="py-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Sparkles size={21} aria-hidden />
      </span>
      <h3 className="mt-3 font-sans text-title text-on-surface">Seu histórico começa aqui</h3>
      <p className="mx-auto mt-1 max-w-[42ch] font-sans text-body-sm text-on-surface-variant">
        Responda à anamnese ou registre uma informação clínica que seja importante para você.
      </p>
      {onAddRecord ? (
        <button type="button" onClick={onAddRecord} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary">
          <Plus size={17} aria-hidden /> Adicionar primeiro registro
        </button>
      ) : (
        <Link to="/perfil/saude/novo" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary">
          <Plus size={17} aria-hidden /> Adicionar primeiro registro
        </Link>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
