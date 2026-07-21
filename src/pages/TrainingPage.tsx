import { useMemo, useState, type ReactNode } from 'react';
import { Activity, Bike, ChevronLeft, ChevronRight, Dumbbell, Flame, Footprints, HeartPulse, Leaf, Play, Plus, RotateCcw, Waves, Watch } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { type ActivitySource, type ImportedActivity, type ScheduledWorkout, type TrainingStatus, type TrainingSurface, useTraining } from '@/features/training/TrainingProvider';
import { useAppleHealth } from '@/features/wearables/useAppleHealth';
import { useTranslation, type TranslationKey } from '@/i18n/I18nProvider';

type Tab = 'today' | 'history' | 'progress';
type AppleHealthState = ReturnType<typeof useAppleHealth>;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const today = () => dateKey(new Date());
const statusLabel: Record<TrainingStatus, string> = { planned: 'Planejado', active: 'Em andamento', partial: 'Parcial', completed: 'Concluído', missed: 'Não realizado', imported: 'Importado', rest: 'Descanso' };
const sourceLabel = (source: string) => ({ healthkit: 'Apple Health', apple_health: 'Apple Health', garmin: 'Garmin', strava: 'Strava', coros: 'COROS', fitbit: 'Fitbit', manual: 'Registro pessoal', onlyfit: 'OnlyFit' }[source] ?? source);
const enduranceSurfaces: TrainingSurface[] = ['running', 'cycling', 'walking', 'swimming'];
const surfaceIcon: Record<TrainingSurface, ReactNode> = {
  strength: <Dumbbell size={18} />,
  running: <Activity size={18} />,
  cycling: <Bike size={18} />,
  walking: <Footprints size={18} />,
  swimming: <Waves size={18} />,
  functional: <Flame size={18} />,
  hiit: <Flame size={18} />,
  yoga: <Leaf size={18} />,
  pilates: <HeartPulse size={18} />,
  other: <Plus size={18} />,
};
const surfaceTranslationKey: Record<TrainingSurface, TranslationKey> = {
  strength: 'meufit.training.surface.strength',
  running: 'meufit.training.surface.running',
  cycling: 'meufit.training.surface.cycling',
  walking: 'meufit.training.surface.walking',
  swimming: 'meufit.training.surface.swimming',
  functional: 'meufit.training.surface.functional',
  hiit: 'meufit.training.surface.hiit',
  yoga: 'meufit.training.surface.yoga',
  pilates: 'meufit.training.surface.pilates',
  other: 'meufit.training.surface.other',
};

function formatActivityMeta(activity: { durationMin: number; source: string; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number }) {
  return [
    `${activity.durationMin} min`,
    activity.distanceKm ? `${activity.distanceKm.toLocaleString('pt-BR')} km` : null,
    activity.calories ? `${activity.calories} kcal` : null,
    activity.averageHeartRate ? `${activity.averageHeartRate} bpm` : null,
    activity.elevationM ? `${activity.elevationM} m alt.` : null,
    sourceLabel(activity.source),
  ].filter(Boolean).join(' · ');
}

function WatchOriginChip() {
  return (
    <span className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 font-sans text-counter text-primary">
      <Watch size={12} aria-hidden />
      Watch
    </span>
  );
}

export function TrainingPage() { return <TrainingContent />; }

function TrainingContent() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('today');
  const [recordOpen, setRecordOpen] = useState(false);
  const { scheduled, imported, activeSession, addActivity } = useTraining();
  const appleHealth = useAppleHealth();
  const allImported = useMemo<ImportedActivity[]>(() => [...appleHealth.importedActivities, ...imported], [appleHealth.importedActivities, imported]);
  const todayItems = scheduled.filter((item) => item.date === today());
  const activeItem = activeSession ? todayItems.find((item) => item.id === activeSession.scheduledId) : null;
  return <div className="relative flex h-full flex-col overflow-y-auto bg-background pb-8">
    <PageTopBar title={t('meufit.training.pageTitle')} backFallback="/meu-fit" />
    <main className="mx-auto w-full max-w-[720px] px-5 pb-6 pt-5">
      <div className="grid grid-cols-3 rounded-xl bg-surface-container p-1" role="tablist" aria-label={t('meufit.training.tabs.aria')}>
        {([
          ['today', t('meufit.training.tabs.today')],
          ['history', t('meufit.training.tabs.history')],
          ['progress', t('meufit.training.tabs.progress')],
        ] as [Tab, string][]).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={clsx('min-h-[40px] rounded-lg font-sans text-counter transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', tab === value ? 'bg-surface-container-lowest text-on-surface' : 'text-on-surface-variant')}>
            {label}
          </button>
        ))}
      </div>
      {tab !== 'today' ? <AppleHealthCard appleHealth={appleHealth} /> : null}
      {tab === 'today' && <Today items={todayItems} active={activeItem ?? null} />}
      {tab === 'history' && <History imported={allImported} onRecord={() => setRecordOpen(true)} />}
      {tab === 'progress' && <Progress appleHealth={appleHealth} />}
    </main>
    <AddActivitySheet open={recordOpen} onClose={() => setRecordOpen(false)} selectedDate={today()} onAdd={(activity) => { addActivity(activity); setRecordOpen(false); }} />
  </div>;
}

function Today({ items, active }: { items: ScheduledWorkout[]; active: ScheduledWorkout | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templates, startSession, activeSession, reschedule } = useTraining();
  const [selectedSurface, setSelectedSurface] = useState<TrainingSurface | null>(null);
  const workouts = items.filter((item) => item.status !== 'rest');
  const types = Array.from(new Set(workouts.map((item) => item.surface)));
  const currentSurface = selectedSurface && types.includes(selectedSurface) ? selectedSurface : null;
  const selectedWorkouts = currentSurface ? workouts.filter((item) => item.surface === currentSurface) : [];

  if (!currentSurface) {
    return (
      <section className="mt-6">
        <h2 className="font-sans text-title-lg text-on-surface">{t('meufit.training.today.chooseType')}</h2>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.chooseTypeDescription')}</p>
        {types.length ? (
          <div className="mt-5 space-y-3">
            {types.map((surface) => {
              const surfaceWorkouts = workouts.filter((item) => item.surface === surface);
              const surfaceActive = active?.surface === surface;
              const duration = surfaceWorkouts.reduce((total, item) => total + item.durationMin, 0);
              return (
                <button
                  key={surface}
                  type="button"
                  onClick={() => setSelectedSurface(surface)}
                  className="flex min-h-[76px] w-full items-center gap-4 rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-3 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('meufit.training.today.openType', { type: t(surfaceTranslationKey[surface]) })}
                >
                  <TrainingBadge surface={surface} status={surfaceActive ? 'active' : surfaceWorkouts[0].status} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-label text-on-surface">{t(surfaceTranslationKey[surface])}</span>
                    <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
                      {t(surfaceWorkouts.length === 1 ? 'meufit.training.today.workoutCount' : 'meufit.training.today.workoutCountPlural', { count: surfaceWorkouts.length })} · {t('meufit.training.today.minutes', { minutes: duration })}
                    </span>
                  </span>
                  {surfaceActive ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-sans text-counter text-primary">{t('meufit.training.today.inProgress')}</span> : null}
                  <ChevronRight size={20} className="shrink-0 text-on-surface-variant" aria-hidden />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-outline-variant/50 px-4 py-6">
            <p className="font-sans text-label text-on-surface">{t('meufit.training.today.emptyTitle')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.emptyDescription')}</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mt-6">
      <button type="button" onClick={() => setSelectedSurface(null)} className="inline-flex min-h-11 items-center gap-2 font-sans text-label text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('meufit.training.today.backToTypes')}>
        <ChevronLeft size={18} aria-hidden />
        {t('meufit.training.today.backToTypes')}
      </button>
      <div className="mt-3 flex items-center gap-3">
        <TrainingBadge surface={currentSurface} status={active?.surface === currentSurface ? 'active' : selectedWorkouts[0].status} />
        <div>
          <h2 className="font-sans text-title-lg text-on-surface">{t(surfaceTranslationKey[currentSurface])}</h2>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.todayOnly')}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {selectedWorkouts.map((item) => {
          const template = templates.find((entry) => entry.id === item.templateId);
          const isActive = activeSession?.scheduledId === item.id;
          const canStart = item.status === 'planned' || item.status === 'active' || item.status === 'partial';
          return (
            <article key={item.id} className="rounded-xl border border-outline-variant/40 bg-surface-container p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sans text-title text-on-surface">{item.title}</h3>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{item.focus} · {t('meufit.training.today.minutes', { minutes: item.durationMin })}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">{statusLabel[item.status]}</span>
              </div>
              <div className="mt-5 border-t border-outline-variant/40 pt-4">
                <h4 className="font-sans text-label text-on-surface">{t('meufit.training.today.exercises')}</h4>
                {template?.exercises.length ? (
                  <ol className="mt-3 space-y-3">
                    {template.exercises.map((exercise, index) => (
                      <li key={exercise.id} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-counter text-primary">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans text-label text-on-surface">{exercise.name}</span>
                          <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{exercise.muscle} · {exercise.sets} × {exercise.targetReps}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 font-sans text-body-sm text-on-surface-variant">{t('meufit.training.today.noExercises')}</p>
                )}
              </div>
              {canStart ? (
                <button type="button" onClick={() => { startSession(item.id); navigate('/meu-fit/treino/player'); }} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container">
                  <Play size={18} fill="currentColor" aria-hidden />
                  {t(isActive ? 'meufit.training.today.continue' : 'meufit.training.today.start')}
                </button>
              ) : null}
              {item.status === 'missed' ? (
                <button type="button" onClick={() => reschedule(item.id)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-container-high font-sans text-label text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <RotateCcw size={18} aria-hidden />
                  {t('meufit.training.today.reschedule')}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AppleHealthCard({ appleHealth, compact }: { appleHealth: AppleHealthState; compact?: boolean }) {
  const { t } = useTranslation();
  const hasImportedData = appleHealth.importedActivities.length > 0 || appleHealth.dailySummaries.length > 0;
  const hasCompletedSync = Boolean(appleHealth.connection?.last_sync_at) || hasImportedData;
  const connected = appleHealth.connection?.status === 'connected' && hasCompletedSync;
  const waitingForNativeState = appleHealth.isNativeIos && appleHealth.isLoading && !appleHealth.connection;
  const unavailable = !appleHealth.available && !appleHealth.isLoading;
  if (!connected && !waitingForNativeState && !appleHealth.isNativeIos) return null;
  const syncing = appleHealth.sync.isPending;
  const lastSync = appleHealth.connection?.last_sync_at
    ? new Date(appleHealth.connection.last_sync_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const error = appleHealth.sync.error instanceof Error
    ? appleHealth.sync.error.message
    : appleHealth.connection?.last_error;

  return (
    <section className={clsx('mt-4 rounded-2xl border border-outline-variant/40 bg-surface-container p-4', compact && connected && 'py-3')}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-primary">
          <Watch size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-sans text-label text-on-surface">{t('health.apple.title')}</h2>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {waitingForNativeState
                  ? t('common.loading')
                  : unavailable
                  ? (appleHealth.availabilityReason || t('health.apple.unavailable'))
                  : connected
                    ? `${t('health.apple.connected')}${lastSync ? ` · ${lastSync}` : ''}`
                    : t('health.apple.description')}
              </p>
            </div>
            {connected ? (
              <button
                type="button"
                onClick={() => appleHealth.sync.mutate('manual')}
                disabled={syncing}
                className="min-h-10 shrink-0 rounded-full bg-primary px-4 font-sans text-counter text-on-primary disabled:opacity-60"
              >
                {syncing ? t('health.apple.syncing') : t('health.apple.sync')}
              </button>
            ) : null}
          </div>

          {!connected && !unavailable && !waitingForNativeState ? (
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/35 bg-surface px-3 py-3">
                <span className="font-sans text-body-sm text-on-surface">{t('health.apple.shareWithCoach')}</span>
                <input
                  type="checkbox"
                  checked={appleHealth.shareWithCoach}
                  onChange={(event) => appleHealth.setShareWithCoach(event.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
              </label>
              <button
                type="button"
                onClick={() => appleHealth.sync.mutate('initial')}
                disabled={syncing}
                className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary disabled:opacity-60"
              >
                {syncing ? t('health.apple.connecting') : t('health.apple.connect')}
              </button>
            </div>
          ) : null}

          {appleHealth.lastSyncMessage ? <p className="mt-3 font-sans text-counter text-primary">{appleHealth.lastSyncMessage}</p> : null}
          {error ? <p className="mt-3 font-sans text-body-sm text-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function History({ imported, onRecord }: { imported: ImportedActivity[]; onRecord: () => void }) {
  const { t } = useTranslation();
  const { scheduled } = useTraining();
  const entries = [
    ...scheduled.filter((item) => ['completed', 'partial', 'missed'].includes(item.status)).map((item) => ({ id: item.id, date: item.date, title: item.title, meta: item.summary ?? `${item.durationMin} min · ${statusLabel[item.status].toLowerCase()}`, status: item.status, surface: item.surface, importedFromWatch: false })),
    ...imported.map((item) => ({ id: item.id, date: item.date, title: item.title, meta: formatActivityMeta(item), status: 'imported' as TrainingStatus, surface: item.surface, importedFromWatch: Boolean(item.importedFromWatch) })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-sans text-title text-on-surface">Histórico</h2>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Treinos e atividades registrados.</p>
        </div>
        <button type="button" onClick={onRecord} className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-primary px-4 font-sans text-counter text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label={t('meufit.training.history.record')}>
          <Plus size={16} aria-hidden />
          {t('meufit.training.history.record')}
        </button>
      </div>
      <div className="mt-4 space-y-2">{entries.length ? entries.map((item) => <HistoryRow key={item.id} {...item} />) : <p className="rounded-xl border border-dashed border-outline-variant/50 px-4 py-5 font-sans text-body-sm text-on-surface-variant">Sem atividades registradas ainda.</p>}</div>
    </section>
  );
}
function HistoryRow({ date, title, meta, status, surface, importedFromWatch }: { date: string; title: string; meta: string; status: TrainingStatus; surface: TrainingSurface; importedFromWatch?: boolean }) { return <div className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container p-3"><TrainingBadge surface={surface} status={status} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 break-words font-sans text-label leading-snug text-on-surface">{title}</p>{importedFromWatch ? <WatchOriginChip /> : null}</div><p className="mt-0.5 break-words font-sans text-body-sm leading-snug text-on-surface-variant">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {meta}</p></div></div>; }
function Progress({ appleHealth }: { appleHealth: AppleHealthState }) { const { scheduled } = useTraining(); const completed = scheduled.filter((item) => item.status === 'completed').length; const sleep = appleHealth.progress.avgSleepMinutes ? `${Math.floor(appleHealth.progress.avgSleepMinutes / 60)}h${String(appleHealth.progress.avgSleepMinutes % 60).padStart(2, '0')}` : '—'; return <section className="mt-6"><h2 className="font-sans text-title text-on-surface">Progresso</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Leitura simples da sua consistência com dados importados quando existirem.</p><div className="mt-5 grid grid-cols-2 gap-3"><Metric icon="✓" value={`${completed}`} label="treinos concluídos" /><Metric icon="↯" value={appleHealth.progress.activeKcal ? `${Math.round(appleHealth.progress.activeKcal)} kcal` : '—'} label="calorias ativas" /><Metric icon="⌁" value={appleHealth.progress.steps ? appleHealth.progress.steps.toLocaleString('pt-BR') : '—'} label="passos em 30 dias" /><Metric icon="☾" value={sleep} label="sono médio" /></div><div className="mt-5 rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><div className="flex items-center gap-2 text-primary"><Watch size={18} aria-hidden /><span className="font-sans text-label">Fonte Apple Health</span></div><p className="mt-4 font-sans text-title-lg text-on-surface">{appleHealth.importedActivities.length}</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">atividades importadas do iPhone/Apple Watch.</p></div></section>; }
function Metric({ icon, value, label }: { icon: string; value: string; label: string }) { return <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><span className="font-sans text-label text-primary">{icon}</span><p className="mt-3 font-sans text-title text-on-surface">{value}</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{label}</p></div>; }
function TrainingBadge({ surface, status }: { surface: TrainingSurface; status: TrainingStatus }) {
  const completed = status === 'completed' || status === 'imported';
  const missed = status === 'missed';
  return (
    <span
      className={clsx(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
        completed && 'border-primary/35 bg-primary/10 text-primary',
        missed && 'border-error/35 bg-error/10 text-error',
        !completed && !missed && 'border-outline-variant/40 bg-surface-container-high text-on-surface-variant',
      )}
      aria-hidden
    >
      {surfaceIcon[surface]}
    </span>
  );
}
const surfaces: { value: TrainingSurface; label: string; icon: ReactNode }[] = [
  { value: 'strength', label: 'Musculação', icon: <Dumbbell size={18} /> },
  { value: 'running', label: 'Corrida', icon: <Activity size={18} /> },
  { value: 'cycling', label: 'Bike', icon: <Bike size={18} /> },
  { value: 'walking', label: 'Caminhada', icon: <Footprints size={18} /> },
  { value: 'hiit', label: 'HIIT', icon: <Flame size={18} /> },
  { value: 'other', label: 'Outro', icon: <Plus size={18} /> },
];

function AddActivitySheet({
  open,
  onClose,
  selectedDate,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  onAdd: (activity: { date: string; title: string; durationMin: number; surface: TrainingSurface; source: ActivitySource; distanceKm?: number; calories?: number; averageHeartRate?: number; elevationM?: number }) => void;
}) {
  const [surface, setSurface] = useState<TrainingSurface>('strength');
  const [duration, setDuration] = useState(55);
  const [distance, setDistance] = useState('5,0');
  const [calories, setCalories] = useState('420');
  const [averageHeartRate, setAverageHeartRate] = useState('145');
  const [elevation, setElevation] = useState('');

  const selectedSurface = surfaces.find((item) => item.value === surface) ?? surfaces[0];
  const isEndurance = enduranceSurfaces.includes(surface);
  const readNumber = (value: string) => Number(String(value).replace(',', '.')) || undefined;
  const activityMetrics = {
    distanceKm: isEndurance ? readNumber(distance) : undefined,
    calories: readNumber(calories),
    averageHeartRate: readNumber(averageHeartRate),
    elevationM: isEndurance ? readNumber(elevation) : undefined,
  };

  const addManual = () => {
    onAdd({
      date: selectedDate,
      title: selectedSurface.value === 'strength' ? 'Musculação registrada' : `${selectedSurface.label} registrada`,
      durationMin: duration,
      surface,
      source: 'manual',
      ...activityMetrics,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Adicionar registro"
      description="Registro manual feito fora do Player. Para Apple Health, use o card de conexão real em Treinos."
      panelClassName="max-h-[92%]"
    >
      <div className="space-y-5 px-5 pb-6">
        <div>
          <p className="font-sans text-label text-on-surface">Modalidade</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {surfaces.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSurface(item.value)}
                className={clsx(
                  'flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border font-sans text-counter',
                  surface === item.value
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant/35 bg-surface-container text-on-surface-variant',
                )}
              >
                <span className={surface === item.value ? 'text-on-primary' : 'text-on-surface-variant'}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/35 bg-surface-container p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-sans text-counter text-on-surface-variant">Duração</p>
              <p className="mt-1 font-sans text-title-lg text-on-surface">{duration} min</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDuration((value) => Math.max(5, value - 5))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-high text-on-surface"
                aria-label="Diminuir duração"
              >
                <ChevronLeft size={19} />
              </button>
              <button
                type="button"
                onClick={() => setDuration((value) => value + 5)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary"
                aria-label="Aumentar duração"
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isEndurance ? (
            <MetricInput label="Distância" value={distance} onChange={setDistance} suffix="km" inputMode="decimal" />
          ) : null}
          <MetricInput label="Calorias" value={calories} onChange={setCalories} suffix="kcal" inputMode="numeric" />
          <MetricInput label="FC média" value={averageHeartRate} onChange={setAverageHeartRate} suffix="bpm" inputMode="numeric" />
          {isEndurance ? (
            <MetricInput label="Elevação" value={elevation} onChange={setElevation} suffix="m" inputMode="numeric" optional />
          ) : null}
        </div>

        <button
          type="button"
          onClick={addManual}
          className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary"
        >
          Salvar registro
        </button>
      </div>
    </BottomSheet>
  );
}

function MetricInput({
  label,
  value,
  onChange,
  suffix,
  inputMode,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  inputMode: 'numeric' | 'decimal';
  optional?: boolean;
}) {
  return (
    <label className="rounded-2xl border border-outline-variant/35 bg-surface-container px-4 py-3">
      <span className="font-sans text-counter text-on-surface-variant">
        {label}{optional ? ' opcional' : ''}
      </span>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent font-sans text-title text-on-surface outline-none placeholder:text-on-surface-variant/45"
        />
        <span className="font-sans text-counter text-on-surface-variant">{suffix}</span>
      </div>
    </label>
  );
}
