import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ArrowLeft, Bell, Check, Clock3, Droplets, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTranslation } from '@/i18n/I18nProvider';
import { MyFitSectionNav } from './MyFitSectionNav';
import { useAuth } from '@/contexts/AuthContext';
import {
  createDailyProtocol,
  loadDailyProtocolConsumption,
  loadDailyProtocols,
  recordDailyProtocolConsumption,
  saveDailyProtocolCheckIn,
  undoDailyProtocolConsumption,
  WATER_RATE_LIMIT_MESSAGE,
  WATER_RECONCILIATION_MESSAGE,
  type DailyProtocol,
  type DailyProtocolDraft,
  type WaterConsumptionEvent,
} from './protocolRepository';

type RoutineKind = 'water' | 'reminder';
type TimingMode = 'specific' | 'interval';
type Routine = DailyProtocol;

interface TimeSlot {
  id: number;
  value: string;
}

function nextSlotId(times: TimeSlot[]): number {
  return times.reduce((highest, slot) => Math.max(highest, slot.id), 0) + 1;
}

function intervalTimes(start: string, end: string, everyHours: number): string[] {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const from = startHour * 60 + startMinute;
  const to = endHour * 60 + endMinute;
  if (to < from) return [start];
  const values: string[] = [];
  for (let current = from; current <= to; current += everyHours * 60) {
    values.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
  }
  return values;
}

function defaultWaterAmount(goalMl: number, count: number): number {
  return Math.max(50, Math.round(goalMl / Math.max(count, 1) / 50) * 50);
}

function notificationId(routineId: string, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  let hash = 2166136261;
  for (const char of `${routineId}:${time}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_000_000_000 + hours * 100 + minutes;
}

async function scheduleRoutineNotifications(routine: Routine, requestPermission = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const currentIds = new Set(routine.times.map((time) => notificationId(routine.id, time)));
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications
    .filter((notification) => {
      const extra = notification.extra as Record<string, unknown> | undefined;
      return currentIds.has(notification.id) || extra?.protocolId === routine.id;
    })
    .map((notification) => ({ id: notification.id }));
  if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids });
  if (!routine.notifications) return;
  const permission = requestPermission
    ? await LocalNotifications.requestPermissions()
    : await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  const consumed = Object.values(routine.waterConsumed ?? {}).reduce((sum, amount) => sum + amount, 0);
  if (routine.kind === 'water' && routine.goalMl != null && consumed >= routine.goalMl) return;
  await LocalNotifications.schedule({
    notifications: routine.times.map((time) => {
      const [hour, minute] = time.split(':').map(Number);
      const amount = routine.kind === 'water' ? routine.waterPlan?.[time] : null;
      return {
        id: notificationId(routine.id, time),
        title: routine.title,
        body: routine.kind === 'water'
          ? `${routine.reminderText?.trim() || (amount ? `Hora de beber ${amount} ml de água.` : 'Hora de beber água.')} (recipiente de ${routine.containerMl ?? 250} ml).`
          : routine.reminderText?.trim() || 'Lembrete OnlyFit.',
        schedule: { on: { hour, minute }, repeats: true },
        smallIcon: 'ic_stat_icon_config_sample',
        extra: { route: `/meu-fit/rotina?protocol=${routine.id}`, protocolId: routine.id },
      };
    }),
  });
}

async function reconcileRoutineNotifications(routines: Routine[]): Promise<void> {
  await Promise.all(routines.map((routine) => scheduleRoutineNotifications(routine)));
}

export function RoutinePage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedWaterEvents, setSelectedWaterEvents] = useState<WaterConsumptionEvent[]>([]);
  const [selectedWaterEventsLoading, setSelectedWaterEventsLoading] = useState(false);
  const [pendingWaterActions, setPendingWaterActions] = useState<Set<string>>(() => new Set());
  const refreshInFlight = useRef(false);
  const lastRefreshAt = useRef(0);
  const refreshToken = useRef(0);

  const visibleRoutines = useMemo(
    () => loadedUserId === session?.user.id ? routines : [],
    [loadedUserId, routines, session?.user.id],
  );
  const selected = useMemo(() => visibleRoutines.find((routine) => routine.id === selectedId) ?? null, [visibleRoutines, selectedId]);
  const displayLoading = loading || Boolean(session?.user.id && loadedUserId !== session.user.id);
  useEffect(() => {
    if (!selected || selected.kind !== 'water') {
      return;
    }
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) setSelectedWaterEventsLoading(true);
        return loadDailyProtocolConsumption(selected.id);
      })
      .then((day) => { if (active) setSelectedWaterEvents(day.events); })
      .catch((error) => {
        if (!active) return;
        setSelectedWaterEvents([]);
        if (error instanceof Error && error.message === WATER_RECONCILIATION_MESSAGE) {
          setLoadError(WATER_RECONCILIATION_MESSAGE);
        }
      })
      .finally(() => { if (active) setSelectedWaterEventsLoading(false); });
    return () => { active = false; };
  }, [selected]);
  useEffect(() => {
    if (!session?.user.id) {
      return;
    }
    let active = true;
    const token = ++refreshToken.current;
    refreshInFlight.current = true;
    loadDailyProtocols(session.user.id)
      .then((items) => {
        if (!active) return;
        setRoutines(items);
        setLoadedUserId(session.user.id);
        setLoadError(null);
        void reconcileRoutineNotifications(items);
        const protocolId = searchParams.get('protocol');
        if (protocolId && items.some((item) => item.id === protocolId)) {
          setSelectedId(protocolId);
          setSearchParams({}, { replace: true });
        }
      })
      .catch(() => {
        if (active) setLoadError('Não foi possível carregar seus protocolos.');
      })
      .finally(() => {
        if (refreshToken.current === token) refreshInFlight.current = false;
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [searchParams, session?.user.id, setSearchParams]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    let active = true;
    const refresh = () => {
      // Never replace an optimistic card while an event is being confirmed.
      if (pendingWaterActions.size > 0) return;
      const now = Date.now();
      if (refreshInFlight.current || now - lastRefreshAt.current < 1000) return;
      const token = ++refreshToken.current;
      refreshInFlight.current = true;
      lastRefreshAt.current = now;
      void loadDailyProtocols(userId).then((items) => {
        if (active) {
          setRoutines(items);
          setLoadedUserId(userId);
          setLoadError(null);
          void reconcileRoutineNotifications(items);
        }
      }).catch(() => {
        if (active) setLoadError('Não foi possível atualizar os protocolos.');
      }).finally(() => {
        if (refreshToken.current === token) refreshInFlight.current = false;
      });
    };
    const onOnline = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pendingWaterActions, session?.user.id]);

  function persistCheckIn(next: Routine): Promise<void> {
    if (!session?.user.id) return Promise.reject(new Error('Sessão expirada.'));
    return saveDailyProtocolCheckIn(session.user.id, next);
  }

  function toggleCheck(routineId: string, time: string) {
    const previous = routines.find((routine) => routine.id === routineId);
    if (!previous) return;
    const next = { ...previous, checked: previous.checked.includes(time) ? previous.checked.filter((item) => item !== time) : [...previous.checked, time] };
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId) return routine;
      return next;
    }));
    void persistCheckIn(next).catch(() => {
      setRoutines((current) => current.map((routine) => {
        const stillOptimistic = routine.id === routineId
          && routine.checked.length === next.checked.length
          && routine.checked.every((item, index) => item === next.checked[index]);
        return stillOptimistic ? previous : routine;
      }));
      setLoadError('Não foi possível sincronizar a alteração. Tente novamente.');
    });
  }

  function updateWaterConsumed(routineId: string, time: string, delta: number) {
    if (pendingWaterActions.has(routineId)) return;
    const previous = routines.find((routine) => routine.id === routineId);
    if (!previous || previous.kind !== 'water') return;
    const previousAmount = previous.waterConsumed?.[time] ?? 0;
    const nextAmount = Math.max(0, previousAmount + delta);
    if (nextAmount === previousAmount) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10);
    const optimistic = { ...previous, waterConsumed: { ...previous.waterConsumed, [time]: nextAmount } };
    setPendingWaterActions((current) => new Set(current).add(routineId));
    setRoutines((current) => current.map((routine) => routine.id === routineId ? optimistic : routine));
    const operation = delta > 0
      ? recordDailyProtocolConsumption(routineId, time, delta)
      : undoDailyProtocolConsumption(routineId, time);
    void operation.then((result) => {
      const updated = { ...previous, waterConsumed: result.consumed, stateDate: result.stateDate };
      setRoutines((current) => current.map((routine) => routine.id === routineId ? updated : routine));
      // Reconciliation cancels the remaining reminders as soon as today's
      // goal is reached, without asking for permission again.
      void scheduleRoutineNotifications(updated);
      if (selectedId === routineId) {
        void loadDailyProtocolConsumption(routineId).then((day) => setSelectedWaterEvents(day.events)).catch(() => undefined);
      }
    }).catch((error) => {
      setRoutines((current) => current.map((routine) => routine.id === routineId ? previous : routine));
      setLoadError(error instanceof Error && error.message === WATER_RATE_LIMIT_MESSAGE
        ? WATER_RATE_LIMIT_MESSAGE
        : 'Não foi possível sincronizar o consumo. Tente novamente.');
    }).finally(() => {
      setPendingWaterActions((current) => {
        const next = new Set(current);
        next.delete(routineId);
        return next;
      });
    });
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-background pb-10">
        <PageTopBar title={t('meufit.routine.title')} backFallback="/meu-fit" />
        <div className="mx-auto w-full max-w-[720px] px-6 pt-6">
          <MyFitSectionNav />
          {displayLoading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
            </div>
          ) : loadError && visibleRoutines.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <p className="font-sans text-body text-on-surface">{loadError}</p>
            </div>
          ) : visibleRoutines.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <Clock3 size={40} className="text-primary" aria-hidden />
              <h2 className="mt-4 font-sans text-title text-on-surface">{t('meufit.routine.emptyTitle')}</h2>
              <p className="mt-1 max-w-xs font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.emptyDescription')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visibleRoutines.map((routine) => (
                <RoutineCard
                  key={routine.id}
                  routine={routine}
                  onOpen={() => setSelectedId(routine.id)}
                  onWaterChange={updateWaterConsumed}
                  waterActionPending={pendingWaterActions.has(routine.id)}
                />
              ))}
            </div>
          )}
          <button type="button" onClick={() => setWizardOpen(true)} className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary font-sans text-label text-on-primary active:opacity-90">
            <Plus size={20} aria-hidden /> {t('meufit.routine.create')}
          </button>
        </div>
      </div>

      {wizardOpen && <RoutineWizard onClose={() => setWizardOpen(false)} onCreate={async (draft) => {
        if (!session?.user.id) return;
        const routine = await createDailyProtocol(session.user.id, draft);
        setRoutines((current) => [...current, routine]);
        setWizardOpen(false);
        void scheduleRoutineNotifications(routine, true);
      }} />}

      <BottomSheet open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.title ?? ''}>
      {selected && <RoutineDetail key={selected.id} routine={selected} onToggle={toggleCheck} onWaterChange={updateWaterConsumed} events={selectedWaterEvents} eventsLoading={selectedWaterEventsLoading} />}
      </BottomSheet>
    </>
  );
}

function RoutineCard({
  routine,
  onOpen,
  onWaterChange,
  waterActionPending,
}: {
  routine: DailyProtocol;
  onOpen: () => void;
  onWaterChange: (routineId: string, time: string, delta: number) => void;
  waterActionPending: boolean;
}) {
  const { t } = useTranslation();
  const isWater = routine.kind === 'water';
  const consumed = Object.values(routine.waterConsumed ?? {}).reduce((sum, amount) => sum + amount, 0);
  const goal = routine.goalMl ?? 0;
  const progress = goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0;
  const container = routine.containerMl ?? 250;
  const firstSlot = routine.times[0];
  const minusSlot = routine.times.slice().reverse().find((time) => (routine.waterConsumed?.[time] ?? 0) > 0) ?? firstSlot;
  return (
    <article aria-busy={waterActionPending} className="flex min-h-[190px] flex-col rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
      <button type="button" onClick={onOpen} className="flex min-h-0 flex-1 flex-col items-start justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {isWater ? <Droplets size={30} className="text-primary" aria-hidden /> : <Bell size={30} className="text-primary" aria-hidden />}
        <span className="mt-4 w-full">
          <span className="block break-words font-sans text-label text-on-surface">{isWater ? 'Meta diária de água' : routine.title}</span>
          <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
            {isWater ? `${consumed} / ${goal} ml` : `${routine.checked.length}/${routine.times.length} ${t('meufit.routine.done')}`}
          </span>
          <span className="mt-1 block break-words font-sans text-counter text-on-surface-variant">
            {routine.notifications ? routine.times.slice(0, 3).join(' · ') || 'Sem horários' : 'Lembretes desligados'}
          </span>
          {isWater && <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-label="Progresso da meta diária" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span className="block h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} /></span>}
        </span>
      </button>
      {isWater ? (
        <div className="mt-4 flex items-center justify-between border-t border-outline-variant/25 pt-3">
          <span className="font-sans text-counter text-on-surface-variant" aria-live="polite">{waterActionPending ? 'Salvando…' : routine.containerMl ? `Recipiente ${container} ml` : 'Configurar recipiente'}</span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={consumed === 0 || waterActionPending} onClick={() => minusSlot && onWaterChange(routine.id, minusSlot, -container)} aria-label={`Desfazer ${container} ml`} className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface disabled:opacity-35">−</button>
            <button type="button" disabled={waterActionPending} onClick={() => firstSlot && onWaterChange(routine.id, firstSlot, container)} aria-label={`Adicionar ${container} ml`} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-50"><Plus size={17} aria-hidden /></button>
          </span>
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="mt-3 w-fit font-sans text-counter text-on-surface-variant">Abrir protocolo</button>
      )}
    </article>
  );
}

function RoutineWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (routine: DailyProtocolDraft) => Promise<void> }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<RoutineKind | null>(null);
  const [goalMl, setGoalMl] = useState(2000);
  const [goalDraft, setGoalDraft] = useState('2000');
  const [containerMl, setContainerMl] = useState(250);
  const [containerDraft, setContainerDraft] = useState('250');
  const [name, setName] = useState('');
  const [timingMode, setTimingMode] = useState<TimingMode>('specific');
  const [times, setTimes] = useState<TimeSlot[]>([{ id: 1, value: '08:00' }]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('20:00');
  const [everyMinutes, setEveryMinutes] = useState(120);
  const [notifications, setNotifications] = useState(true);
  const [reminderText, setReminderText] = useState('Hora de beber água.');
  const [waterPlan, setWaterPlan] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const schedule = timingMode === 'specific' ? times.map((slot) => slot.value) : intervalTimes(start, end, everyMinutes / 60);
  const intervalValid = timingMode !== 'interval' || (end >= start && schedule.length > 0);
  const totalSteps = kind === 'water' ? 2 : 4;
  const canContinue = (step === 1 ? Boolean(kind) : step !== 2 || kind === 'water' || Boolean(name.trim()))
    && (kind === 'water' ? step !== 2 || !notifications || intervalValid : step !== 3 || intervalValid)
    && !saving;

  function requestClose() {
    if (saving) return;
    const dirty = step > 1 || Boolean(kind) || Boolean(name.trim());
    if (!dirty || typeof window === 'undefined' || window.confirm('Descartar as alterações deste protocolo?')) onClose();
  }

  async function create() {
    if (!kind || (notifications && !intervalValid)) return;
    setSaving(true);
    const effectiveSchedule = notifications ? schedule : times.map((slot) => slot.value);
    const effectiveTimingMode: TimingMode = notifications ? timingMode : 'specific';
    try { await onCreate({
      kind,
      title: kind === 'water' ? t('meufit.routine.waterTitle') : name.trim(),
      goalMl: kind === 'water' ? goalMl : undefined,
      times: effectiveSchedule,
      notifications,
      checked: [],
      waterPlan: kind === 'water' ? Object.fromEntries(effectiveSchedule.map((time) => [time, waterPlan[time] ?? defaultWaterAmount(goalMl, effectiveSchedule.length)])) : undefined,
      waterConsumed: kind === 'water' ? {} : undefined,
      containerMl: kind === 'water' ? containerMl : undefined,
      timingMode: effectiveTimingMode,
      reminderStart: effectiveTimingMode === 'interval' ? start : undefined,
      reminderEnd: effectiveTimingMode === 'interval' ? end : undefined,
      reminderIntervalMinutes: effectiveTimingMode === 'interval' ? everyMinutes : undefined,
      reminderText: reminderText.trim() || (kind === 'water' ? 'Hora de beber água.' : `Lembrete diário: ${name.trim()}.`),
    }); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-outline-variant/30 px-4 pb-4 pt-safe-top">
        <button type="button" onClick={step === 1 ? requestClose : () => setStep((current) => current - 1)} aria-label={step === 1 ? t('meufit.routine.close') : t('meufit.routine.back')} className="flex h-11 w-11 items-center justify-center text-on-surface"><ArrowLeft size={22} aria-hidden /></button>
        <span className="font-sans text-label text-on-surface-variant">{step} {t('meufit.routine.of')} {totalSteps}</span>
        <button type="button" onClick={requestClose} aria-label={t('meufit.routine.close')} className="flex h-11 w-11 items-center justify-center text-on-surface"><X size={22} aria-hidden /></button>
      </header>
      <div className="h-0.5 bg-surface-container-high"><span className="block h-full bg-primary transition-all" style={{ width: `${(step / totalSteps) * 100}%` }} /></div>

      <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col overflow-y-auto px-6 py-8">
        {step === 1 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.step1Title')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.step1Description')}</p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <WizardChoice active={kind === 'water'} icon={Droplets} title={t('meufit.routine.waterTitle')} description={t('meufit.routine.waterDescription')} onClick={() => { setKind('water'); setReminderText('Hora de beber água.'); }} />
              <WizardChoice active={kind === 'reminder'} icon={Bell} title={t('meufit.routine.reminderTitle')} description={t('meufit.routine.reminderDescription')} onClick={() => { setKind('reminder'); setReminderText(''); }} />
            </div>
          </section>
        )}

        {step === 2 && kind === 'water' && (
          <WaterSetup
            waterGoalLabel={String(t('meufit.routine.waterGoal'))}
            goalMl={goalMl}
            goalDraft={goalDraft}
            setGoalMl={setGoalMl}
            setGoalDraft={setGoalDraft}
            containerMl={containerMl}
            setContainerMl={setContainerMl}
            containerDraft={containerDraft}
            setContainerDraft={setContainerDraft}
            notifications={notifications}
            setNotifications={setNotifications}
            reminderText={reminderText}
            setReminderText={setReminderText}
            timingMode={timingMode}
            setTimingMode={setTimingMode}
            times={times}
            setTimes={setTimes}
            start={start}
            end={end}
            everyMinutes={everyMinutes}
            setStart={setStart}
            setEnd={setEnd}
            setEveryMinutes={setEveryMinutes}
            schedule={schedule}
            waterPlan={waterPlan}
            setWaterPlan={setWaterPlan}
          />
        )}

        {step === 2 && kind === 'reminder' && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.reminderQuestion')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.reminderQuestionDescription')}</p>
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t('meufit.routine.reminderPlaceholder')} autoFocus className="mt-8 min-h-[56px] w-full border-b border-outline bg-transparent px-1 font-sans text-title text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none" />
            <div className="mt-5 flex flex-wrap gap-2">
              {[t('meufit.routine.suggestionVitamin'), t('meufit.routine.suggestionMedicine'), t('meufit.routine.suggestionMeal'), t('meufit.routine.suggestionShake')].map((suggestion) => <button key={suggestion} type="button" onClick={() => setName(suggestion)} className="min-h-[36px] rounded-lg border border-outline-variant/50 px-3 font-sans text-counter text-on-surface-variant">{suggestion}</button>)}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.timingTitle')}</p>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.timingDescription')}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <TimingChoice active={timingMode === 'specific'} title={t('meufit.routine.specificTimes')} description={t('meufit.routine.specificTimesDescription')} onClick={() => setTimingMode('specific')} />
              <TimingChoice active={timingMode === 'interval'} title={t('meufit.routine.interval')} description={t('meufit.routine.intervalDescription')} onClick={() => setTimingMode('interval')} />
            </div>
            {timingMode === 'specific' ? <SpecificTimes times={times} onChange={setTimes} /> : <IntervalTimes start={start} end={end} everyMinutes={everyMinutes} onStart={setStart} onEnd={setEnd} onEvery={setEveryMinutes} />}
            {timingMode === 'interval' && !intervalValid && <p role="alert" className="mt-3 font-sans text-body-sm text-error">O fim da janela precisa ser igual ou posterior ao início.</p>}
            {kind === 'water' && <WaterDistribution schedule={schedule} goalMl={goalMl} plan={waterPlan} onChange={setWaterPlan} />}
          </section>
        )}

        {step === 4 && (
          <section>
            <p className="font-sans text-title-lg text-on-surface">{t('meufit.routine.reviewTitle')}</p>
            <div className="mt-7 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container">
              <div className="p-4">
                <p className="font-sans text-title text-on-surface">{kind === 'water' ? t('meufit.routine.waterTitle') : name}</p>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{kind === 'water' ? `${(goalMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L` : schedule.join(' · ')}</p>
              </div>
              <button type="button" onClick={() => setNotifications((value) => !value)} className="flex min-h-[64px] w-full items-center gap-3 border-t border-outline-variant/25 px-4 text-left">
                <Bell size={20} className="text-primary" aria-hidden />
                <span className="flex-1"><span className="block font-sans text-body text-on-surface">{t('meufit.routine.notifications')}</span><span className="block font-sans text-body-sm text-on-surface-variant">{notifications ? t('meufit.routine.notificationsOn') : t('meufit.routine.notificationsOff')}</span></span>
                <span className={clsx('relative h-6 w-11 rounded-full transition-colors', notifications ? 'bg-primary' : 'bg-surface-container-highest')}><span className={clsx('absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest transition-transform', notifications && 'translate-x-5')} /></span>
              </button>
              {notifications && (
                <label className="block border-t border-outline-variant/25 p-4 text-left">
                  <span className="font-sans text-label text-on-surface">Texto do lembrete</span>
                  <input value={reminderText} maxLength={160} onChange={(event) => setReminderText(event.target.value)} placeholder={kind === 'water' ? 'Hora de beber água.' : 'Escreva um lembrete curto'} className="mt-2 min-h-12 w-full rounded-lg border border-outline-variant/40 bg-surface px-3 font-sans text-body text-on-surface outline-none focus:border-primary" />
                </label>
              )}
            </div>
            <p className="mt-4 font-sans text-body-sm text-on-surface-variant">{Capacitor.isNativePlatform() ? 'O app vai agendar lembretes locais neste aparelho.' : t('meufit.routine.notificationHint')}</p>
          </section>
        )}
      </main>
      <footer className="border-t border-outline-variant/30 px-6 pb-safe-bottom pt-3">
        <button type="button" disabled={!canContinue} onClick={() => step === totalSteps ? create() : setStep((current) => current + 1)} className="mb-3 min-h-[52px] w-full rounded-lg bg-primary font-sans text-label text-on-primary transition-opacity disabled:opacity-40">
          {saving ? 'Salvando…' : step === totalSteps ? t('meufit.routine.confirm') : t('meufit.routine.continue')}
        </button>
      </footer>
    </div>
  );
}

function WaterSetup({
  waterGoalLabel, goalMl, goalDraft, setGoalMl, setGoalDraft, containerMl, setContainerMl, containerDraft, setContainerDraft,
  notifications, setNotifications, reminderText, setReminderText,
  timingMode, setTimingMode, times, setTimes, start, end, everyMinutes,
  setStart, setEnd, setEveryMinutes, schedule, waterPlan, setWaterPlan,
}: {
  waterGoalLabel: string;
  goalMl: number;
  goalDraft: string;
  setGoalMl: (value: number) => void;
  setGoalDraft: (value: string) => void;
  containerMl: number;
  setContainerMl: (value: number) => void;
  containerDraft: string;
  setContainerDraft: (value: string) => void;
  notifications: boolean;
  setNotifications: (value: boolean) => void;
  reminderText: string;
  setReminderText: (value: string) => void;
  timingMode: TimingMode;
  setTimingMode: (value: TimingMode) => void;
  times: TimeSlot[];
  setTimes: (value: TimeSlot[]) => void;
  start: string;
  end: string;
  everyMinutes: number;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
  setEveryMinutes: (value: number) => void;
  schedule: string[];
  waterPlan: Record<string, number>;
  setWaterPlan: (value: Record<string, number>) => void;
}) {
  return (
    <section>
      <p className="font-sans text-title-lg text-on-surface">Controle de hidratação</p>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Defina sua meta, recipiente e lembretes em um único passo.</p>
      <div className="mt-8 rounded-2xl border border-outline-variant/40 bg-surface-container p-5 text-center">
        <p className="font-sans text-label text-on-surface-variant">Meta diária</p>
        <div className="mt-3 flex items-center justify-center gap-6">
          <GoalButton label="−" onClick={() => { const next = Math.max(250, goalMl - 250); setGoalMl(next); setGoalDraft(String(next)); }} />
          <label className="min-w-0"><span className="sr-only">{waterGoalLabel}</span><input type="text" inputMode="numeric" value={goalDraft} onChange={(event) => { const next = event.target.value.replace(/\D/g, ''); setGoalDraft(next); const parsed = Number(next); if (Number.isFinite(parsed) && parsed > 0) setGoalMl(Math.min(10000, parsed)); }} onBlur={() => { const next = Math.min(10000, Math.max(250, Math.round((Number(goalDraft) || goalMl) / 250) * 250)); setGoalMl(next); setGoalDraft(String(next)); }} className="w-36 bg-transparent text-center font-sans text-display text-primary outline-none focus:rounded-xl focus:ring-2 focus:ring-primary" /><span className="mt-1 block font-sans text-counter text-on-surface-variant">{(goalMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L · {goalMl} ml</span></label>
          <GoalButton label="+" onClick={() => { const next = Math.min(10000, goalMl + 250); setGoalMl(next); setGoalDraft(String(next)); }} />
        </div>
        <p className="mt-3 font-sans text-body-sm text-on-surface-variant">Uma referência simples para acompanhar sua hidratação diária.</p>
      </div>
      <div className="mt-5 rounded-2xl border border-outline-variant/40 bg-surface-container p-5">
        <p className="font-sans text-label text-on-surface">Recipiente padrão</p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Cada toque no registro adicionará este volume.</p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">{[200, 250, 300, 350, 500, 600, 750].map((amount) => <button key={amount} type="button" onClick={() => { setContainerMl(amount); setContainerDraft(String(amount)); }} className={clsx('min-h-11 rounded-lg border font-sans text-counter', containerMl === amount ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/50 text-on-surface-variant')}>{amount} ml</button>)}</div>
        <label className="mt-3 block font-sans text-label text-on-surface">Outro volume (ml)<input type="text" inputMode="numeric" value={containerDraft} onChange={(event) => { const draft = event.target.value.replace(/\D/g, ''); setContainerDraft(draft); const parsed = Number(draft); if (Number.isFinite(parsed) && parsed > 0) setContainerMl(Math.min(2000, Math.max(50, Math.round(parsed / 50) * 50))); }} onBlur={() => { const normalized = Math.min(2000, Math.max(50, Math.round((Number(containerDraft) || containerMl) / 50) * 50)); setContainerMl(normalized); setContainerDraft(String(normalized)); }} className="mt-2 min-h-11 w-full rounded-lg border border-outline-variant/40 bg-surface px-3 font-sans text-body text-on-surface outline-none focus:border-primary" /></label>
        <p className="mt-3 font-sans text-body-sm text-on-surface-variant">Cada toque adicionará <strong className="text-on-surface">{containerMl} ml</strong>.</p>
      </div>
      <div className="mt-5 rounded-2xl border border-outline-variant/40 bg-surface-container p-5">
        <button type="button" onClick={() => setNotifications(!notifications)} className="flex min-h-12 w-full items-center gap-3 text-left"><Bell size={20} className="text-primary" aria-hidden /><span className="flex-1"><span className="block font-sans text-label text-on-surface">Lembretes</span><span className="block font-sans text-body-sm text-on-surface-variant">{notifications ? 'Ativados' : 'Desligados'}</span></span><span className={clsx('relative h-6 w-11 rounded-full transition-colors', notifications ? 'bg-primary' : 'bg-surface-container-highest')}><span className={clsx('absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest transition-transform', notifications && 'translate-x-5')} /></span></button>
        {notifications && <>
          <div className="mt-5 grid grid-cols-2 gap-3"><TimingChoice active={timingMode === 'specific'} title="Horários" description="Escolha cada horário." onClick={() => setTimingMode('specific')} /><TimingChoice active={timingMode === 'interval'} title="Intervalo" description="Repita durante o dia." onClick={() => setTimingMode('interval')} /></div>
          {timingMode === 'specific' ? <SpecificTimes times={times} onChange={setTimes} /> : <IntervalTimes start={start} end={end} everyMinutes={everyMinutes} onStart={setStart} onEnd={setEnd} onEvery={setEveryMinutes} />}
          <WaterDistribution schedule={schedule} goalMl={goalMl} plan={waterPlan} onChange={setWaterPlan} />
          <label className="mt-5 block font-sans text-label text-on-surface">Texto do lembrete<input value={reminderText} maxLength={160} onChange={(event) => setReminderText(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-outline-variant/40 bg-surface px-3 font-sans text-body text-on-surface outline-none focus:border-primary" /></label>
          <p className="mt-2 font-sans text-counter text-on-surface-variant">{schedule.length} lembrete{schedule.length === 1 ? '' : 's'} por dia</p>
        </>}
      </div>
      <div className="mt-5 rounded-2xl border border-outline-variant/30 p-4">
        <p className="font-sans text-counter uppercase tracking-[0.12em] text-on-surface-variant">Resumo</p>
        <p className="mt-2 font-sans text-body text-on-surface">Meta de {(goalMl / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L · recipiente {containerMl} ml</p>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{notifications ? `${schedule.length} lembrete${schedule.length === 1 ? '' : 's'} configurado${schedule.length === 1 ? '' : 's'}` : 'Lembretes desligados'}</p>
      </div>
    </section>
  );
}

function WizardChoice({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: typeof Droplets; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('flex min-h-[180px] flex-col items-start rounded-2xl border p-4 text-left', active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><Icon size={32} className="text-primary" aria-hidden /><span className="mt-auto font-sans text-label text-on-surface">{title}</span><span className="mt-1 font-sans text-body-sm text-on-surface-variant">{description}</span></button>;
}

function TimingChoice({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={clsx('min-h-[116px] rounded-xl border p-4 text-left', active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><span className="font-sans text-label text-on-surface">{title}</span><span className="mt-1 block font-sans text-body-sm text-on-surface-variant">{description}</span></button>;
}

function GoalButton({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant/50 font-sans text-title text-on-surface">{label}</button>; }

function SpecificTimes({ times, onChange }: { times: TimeSlot[]; onChange: (times: TimeSlot[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-7">
      <span className="font-sans text-label text-on-surface">{t('meufit.routine.times')}</span>
      <div className="mt-3 space-y-2">
        {times.map((slot, index) => (
          <div key={slot.id} className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container p-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-sans text-counter text-primary">{index + 1}</span>
            <input
              type="time"
              value={slot.value}
              onChange={(event) => onChange(times.map((item) => item.id === slot.id ? { ...item, value: event.target.value } : item))}
              className="min-h-[40px] min-w-0 flex-1 bg-transparent font-sans text-body text-on-surface focus:outline-none"
            />
            {times.length > 1 && (
              <button type="button" onClick={() => onChange(times.filter((item) => item.id !== slot.id))} aria-label={t('meufit.routine.removeTime')} className="flex h-10 w-10 items-center justify-center text-on-surface-variant">
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      {times.length < 24 && <button type="button" onClick={() => onChange([...times, { id: nextSlotId(times), value: suggestedTime(times.map((slot) => slot.value)) }])} className="mt-3 flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-outline-variant/60 px-3 font-sans text-label text-primary">
        <Plus size={18} aria-hidden />
        {t('meufit.routine.addTime')}
      </button>}
    </div>
  );
}

function IntervalTimes({ start, end, everyMinutes, onStart, onEnd, onEvery }: { start: string; end: string; everyMinutes: number; onStart: (value: string) => void; onEnd: (value: string) => void; onEvery: (value: number) => void }) {
  const { t } = useTranslation();
  const preview = intervalTimes(start, end, everyMinutes / 60);
  const intervalOptions = [30, 60, 90, 120, 150, 180];
  const intervalLabel = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${minutes % 60 === 30 ? '30' : ''}`;
  return (
    <div className="mt-7 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="font-sans text-label text-on-surface">{t('meufit.routine.from')}<input type="time" value={start} onChange={(event) => onStart(event.target.value)} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" /></label>
        <label className="font-sans text-label text-on-surface">{t('meufit.routine.until')}<input type="time" value={end} onChange={(event) => onEnd(event.target.value)} className="mt-2 min-h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" /></label>
      </div>
      <div>
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.every')}</span>
      <div className="mt-2 grid grid-cols-3 gap-2">{intervalOptions.map((minutes) => <button key={minutes} type="button" onClick={() => onEvery(minutes)} className={clsx('min-h-[40px] rounded-lg border px-3 font-sans text-label', everyMinutes === minutes ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/50 text-on-surface-variant')}>{intervalLabel(minutes)}</button>)}</div>
      </div>
      <div className="rounded-xl bg-surface-container p-4">
        <span className="font-sans text-counter text-on-surface-variant">{t('meufit.routine.schedulePreview')}</span>
        <p className="mt-2 break-words font-sans text-counter text-primary">{preview.slice(0, 6).join(' · ')}{preview.length > 6 ? ` · +${preview.length - 6}` : ''}</p>
      </div>
    </div>
  );
}

function WaterDistribution({ schedule, goalMl, plan, onChange }: { schedule: string[]; goalMl: number; plan: Record<string, number>; onChange: (plan: Record<string, number>) => void }) {
  const { t } = useTranslation();
  const total = schedule.reduce((sum, time) => sum + (plan[time] ?? defaultWaterAmount(goalMl, schedule.length)), 0);
  function amountFor(time: string) { return plan[time] ?? defaultWaterAmount(goalMl, schedule.length); }
  function update(time: string, amount: number) {
    if (!Number.isFinite(amount)) return;
    onChange({ ...plan, [time]: Math.max(0, Math.round(amount / 50) * 50) });
  }

  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-label text-on-surface">{t('meufit.routine.waterDistribution')}</span>
        <span className={clsx('font-sans text-counter', total === goalMl ? 'text-primary' : 'text-on-surface-variant')}>{total} / {goalMl} ml</span>
      </div>
      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.waterDistributionHint')}</p>
      <div className="mt-3 space-y-2">
        {schedule.map((time) => (
          <div key={time} className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container p-2">
            <span className="w-12 font-sans text-label text-on-surface">{time}</span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Quantidade de água às {time}</span>
              <WaterAmountInput key={`${time}:${amountFor(time)}`} value={amountFor(time)} onCommit={(amount) => update(time, amount)} />
            </label>
            <button type="button" onClick={() => update(time, amountFor(time) + 50)} aria-label={t('meufit.routine.increaseAmount')} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plus size={18} aria-hidden /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function suggestedTime(times: string[]): string {
  const latest = [...times].sort().at(-1) ?? '08:00';
  const [hours, minutes] = latest.split(':').map(Number);
  return `${String((hours + 2) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function WaterAmountInput({ value, onCommit }: { value: number; onCommit: (amount: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="flex items-center rounded-lg bg-surface px-2 ring-1 ring-outline-variant/35 focus-within:ring-primary">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '');
          setDraft(next);
          if (next) onCommit(Number(next));
        }}
        onBlur={() => {
          const next = Number(draft) || 0;
          onCommit(next);
          setDraft(String(Math.max(0, Math.round(next / 50) * 50)));
        }}
        className="min-h-10 w-full bg-transparent text-center font-sans text-label text-on-surface outline-none"
      />
      <span className="font-sans text-counter text-on-surface-variant">ml</span>
    </div>
  );
}

function RoutineDetail({ routine, onToggle, onWaterChange, events, eventsLoading }: { routine: Routine; onToggle: (routineId: string, time: string) => void; onWaterChange: (routineId: string, time: string, delta: number) => void; events: WaterConsumptionEvent[]; eventsLoading: boolean }) {
  const { t } = useTranslation();
  const [quickAmount, setQuickAmount] = useState(routine.containerMl ?? 250);
  const consumed = Object.values(routine.waterConsumed ?? {}).reduce((sum, amount) => sum + amount, 0);
  const progress = routine.kind === 'water' && routine.goalMl ? Math.min(100, (consumed / routine.goalMl) * 100) : 0;
  const containerMl = routine.containerMl ?? 250;
  return <div className="px-5 pb-6 pt-2">
    {routine.kind === 'water' && <div className="rounded-xl bg-primary/10 p-4"><div className="flex items-baseline justify-between gap-3"><p className="font-sans text-title text-on-surface">{consumed} / {routine.goalMl} ml</p><span className="font-sans text-counter text-on-surface-variant">Recipiente de {containerMl} ml</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>{consumed >= (routine.goalMl ?? 0) ? <p className="mt-3 font-sans text-body-sm text-primary">Meta diária atingida. Você pode continuar registrando.</p> : routine.notifications ? <p className="mt-3 font-sans text-body-sm text-on-surface-variant">Próximo lembrete: {routine.times.find((time) => (routine.waterConsumed?.[time] ?? 0) < (routine.waterPlan?.[time] ?? 0)) ?? 'nenhum'}</p> : <p className="mt-3 font-sans text-body-sm text-on-surface-variant">Lembretes desligados</p>}</div>}
    {routine.kind === 'water' && <div className="mt-4 flex flex-wrap items-center gap-2"><span className="font-sans text-label text-on-surface">Adicionar</span><select value={quickAmount} onChange={(event) => setQuickAmount(Number(event.target.value))} className="min-h-11 rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface">{[200, 250, 300, 350, 500, 600, 750].map((amount) => <option key={amount} value={amount}>{amount} ml</option>)}<option value={quickAmount}>Outro volume</option></select><input type="number" min={50} max={2000} step={50} value={quickAmount} onChange={(event) => setQuickAmount(Math.min(2000, Math.max(50, Math.round((Number(event.target.value) || 50) / 50) * 50)))} aria-label="Volume personalizado" className="min-h-11 w-28 rounded-lg border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface" /></div>}
    <ul className="mt-4 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface">
      {routine.times.map((time) => {
        const done = routine.checked.includes(time);
        const planned = routine.waterPlan?.[time];
        const amount = routine.waterConsumed?.[time] ?? 0;
        return <li key={time} className="border-t border-outline-variant/25 px-4 py-3 first:border-t-0">
          {routine.kind === 'water' ? <div className="flex items-center gap-3"><span className="w-11 font-sans text-body text-on-surface">{time}</span><span className="flex-1 font-sans text-body-sm text-on-surface-variant">{t('meufit.routine.planned')} {planned ?? 0} ml</span><button type="button" disabled={amount === 0} onClick={() => onWaterChange(routine.id, time, -quickAmount)} aria-label={`Desfazer ${quickAmount} ml`} className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/50 text-on-surface disabled:opacity-35">−</button><span className="min-w-16 text-center font-sans text-label text-on-surface">{amount} ml</span><button type="button" onClick={() => onWaterChange(routine.id, time, quickAmount)} aria-label={`Adicionar ${quickAmount} ml`} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary"><Plus size={17} aria-hidden /></button></div> : <div className="flex min-h-[36px] items-center gap-3"><button type="button" onClick={() => onToggle(routine.id, time)} aria-pressed={done} className={clsx('flex h-8 w-8 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : 'border border-outline text-on-surface-variant')}>{done && <Check size={18} aria-hidden />}</button><span className="font-sans text-body text-on-surface">{time}</span></div>}
        </li>;
      })}
    </ul>
    {routine.kind === 'water' && <section className="mt-5"><div className="flex items-center justify-between"><h3 className="font-sans text-label text-on-surface">Registros de hoje</h3><span className="font-sans text-counter text-on-surface-variant">{events.length} eventos</span></div>{eventsLoading ? <p className="mt-2 font-sans text-body-sm text-on-surface-variant">Carregando registros…</p> : events.length === 0 ? <p className="mt-2 font-sans text-body-sm text-on-surface-variant">Nenhum registro ainda.</p> : <ul className="mt-2 space-y-2">{events.slice().reverse().map((event) => <li key={event.id} className="flex items-center justify-between rounded-lg border border-outline-variant/30 px-3 py-2"><span className="font-sans text-body-sm text-on-surface">{new Date(event.consumedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {event.slotTime}</span><span className="font-sans text-label text-on-surface">+{event.amountMl} ml</span></li>)}</ul>}</section>}
  </div>;
}
