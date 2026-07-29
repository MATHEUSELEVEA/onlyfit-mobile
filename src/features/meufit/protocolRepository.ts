import { supabase } from '@/lib/supabase';

export type ProtocolKind = 'water' | 'reminder';
export type ProtocolTimingMode = 'specific' | 'interval';

export interface DailyProtocol {
  id: string;
  kind: ProtocolKind;
  title: string;
  goalMl?: number;
  times: string[];
  notifications: boolean;
  checked: string[];
  waterPlan?: Record<string, number>;
  waterConsumed?: Record<string, number>;
  stateDate: string;
  containerMl?: number;
  timingMode: ProtocolTimingMode;
  reminderStart?: string;
  reminderEnd?: string;
  reminderIntervalMinutes?: number;
  reminderText?: string;
}

export type DailyProtocolDraft = Omit<DailyProtocol, 'id' | 'stateDate'>;

export const WATER_RATE_LIMIT_MESSAGE =
  'Você registrou água muito rápido. Aguarde alguns segundos e tente novamente.';
export const WATER_RECONCILIATION_MESSAGE =
  'Não foi possível reconciliar o diário de água. Tente novamente em instantes.';

const columns = [
  'id',
  'kind',
  'title',
  'goal_ml',
  'times',
  'notifications',
  'checked',
  'water_plan',
  'consumed',
  'state_date',
  'container_ml',
  'timing_mode',
  'reminder_start',
  'reminder_end',
  'reminder_interval_minutes',
  'reminder_text',
].join(',');
const legacyStorageKey = 'onlyfit:myfit:routines:v1';
const checkInQueues = new Map<string, Promise<void>>();
const consumptionQueues = new Map<string, Promise<ConsumptionResult>>();

export interface ConsumptionResult {
  consumed: Record<string, number>;
  stateDate: string;
  recorded?: boolean;
  duplicate?: boolean;
  removed?: boolean;
}

export interface WaterConsumptionEvent {
  id: string;
  slotTime: string;
  amountMl: number;
  consumedAt: string;
}

export interface WaterConsumptionDay {
  events: WaterConsumptionEvent[];
  consumed: Record<string, number>;
}

interface ProtocolRow {
  id: string;
  kind: ProtocolKind;
  title: string;
  goal_ml: number | null;
  times: string[];
  notifications: boolean;
  checked: string[];
  water_plan: Record<string, number>;
  consumed: Record<string, number>;
  state_date: string;
  container_ml: number | null;
  timing_mode: ProtocolTimingMode;
  reminder_start: string | null;
  reminder_end: string | null;
  reminder_interval_minutes: number | null;
  reminder_text: string | null;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function idempotencyKey(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTransientError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : NaN;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /network|timeout|timed out|fetch failed|connection/.test(message);
}

function isWaterRateLimitedError(error: unknown): boolean {
  const candidate = typeof error === 'object' && error !== null
    ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    : undefined;
  const message = [candidate?.message, candidate?.code, candidate?.details, candidate?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return message.includes('consumption_rate_limited');
}

function isLedgerIntegrityError(error: unknown): boolean {
  const candidate = typeof error === 'object' && error !== null
    ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    : undefined;
  return [candidate?.message, candidate?.code, candidate?.details, candidate?.hint]
    .filter(Boolean).join(' ').toLowerCase().includes('ledger_integrity_violation');
}

const retryDelay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function fromRow(row: ProtocolRow): DailyProtocol {
  const isToday = row.state_date === todayKey();
  const timingMode: ProtocolTimingMode = row.timing_mode === 'interval' ? 'interval' : 'specific';
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    goalMl: row.goal_ml ?? undefined,
    times: row.times ?? [],
    notifications: row.notifications,
    checked: isToday ? row.checked ?? [] : [],
    waterPlan: row.kind === 'water' ? row.water_plan ?? {} : undefined,
    waterConsumed: row.kind === 'water' && isToday ? row.consumed ?? {} : undefined,
    stateDate: isToday ? row.state_date : todayKey(),
    // Keep null distinguishable so the list can invite legacy protocols to
    // configure a container instead of silently hiding the migration state.
    containerMl: row.container_ml ?? undefined,
    timingMode,
    reminderStart: row.reminder_start?.slice(0, 5),
    reminderEnd: row.reminder_end?.slice(0, 5),
    reminderIntervalMinutes: row.reminder_interval_minutes ?? undefined,
    reminderText: row.reminder_text ?? undefined,
  };
}

function toRow(protocol: DailyProtocolDraft, userId: string) {
  const title = protocol.title.trim().slice(0, 120);
  const goalMl = protocol.goalMl == null ? null : Math.min(10000, Math.max(250, Math.round(protocol.goalMl)));
  const containerMl = protocol.kind === 'water'
    ? Math.min(2000, Math.max(50, Math.round(protocol.containerMl ?? 250)))
    : null;
  return {
    user_id: userId,
    kind: protocol.kind,
    title,
    goal_ml: goalMl,
    times: protocol.times.slice(0, 24),
    notifications: protocol.notifications,
    checked: protocol.checked,
    water_plan: protocol.waterPlan ?? {},
    consumed: protocol.waterConsumed ?? {},
    state_date: todayKey(),
    container_ml: containerMl,
    timing_mode: protocol.timingMode === 'interval' ? 'interval' : 'specific',
    reminder_start: protocol.timingMode === 'interval' ? protocol.reminderStart : null,
    reminder_end: protocol.timingMode === 'interval' ? protocol.reminderEnd : null,
    reminder_interval_minutes:
      protocol.timingMode === 'interval' ? protocol.reminderIntervalMinutes : null,
    reminder_text: protocol.reminderText?.trim() || null,
  };
}

export async function loadDailyProtocols(userId: string): Promise<DailyProtocol[]> {
  const { data, error } = await supabase
    .from('user_daily_protocols')
    .select(columns)
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw error;
  const protocols = ((data ?? []) as unknown as ProtocolRow[]).map(fromRow);
  if (protocols.length > 0 || typeof window === 'undefined') return protocols;

  const raw = window.localStorage.getItem(legacyStorageKey);
  if (!raw) return protocols;
  let legacy: Array<Partial<DailyProtocol>>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return protocols;
    legacy = parsed as Array<Partial<DailyProtocol>>;
  } catch {
    window.localStorage.removeItem(legacyStorageKey);
    return protocols;
  }
  const drafts = legacy
    .filter((item) =>
      (item.kind === 'water' || item.kind === 'reminder')
      && typeof item.title === 'string'
      && Array.isArray(item.times),
    )
    .map((item): DailyProtocolDraft => ({
      kind: item.kind!,
      title: item.title!,
      goalMl: item.goalMl,
      times: item.times!,
      notifications: item.notifications !== false,
      checked: item.checked ?? [],
      waterPlan: item.waterPlan ?? {},
      waterConsumed: item.waterConsumed ?? {},
      containerMl: item.kind === 'water' ? item.containerMl ?? 250 : undefined,
      timingMode: item.timingMode === 'interval' ? 'interval' : 'specific',
      reminderStart: item.reminderStart,
      reminderEnd: item.reminderEnd,
      reminderIntervalMinutes: item.reminderIntervalMinutes,
      reminderText: item.reminderText
        ?? (item.kind === 'water' ? 'Hora de beber água.' : `Lembrete diário: ${item.title}.`),
    }));
  if (drafts.length === 0) {
    window.localStorage.removeItem(legacyStorageKey);
    return protocols;
  }
  const { data: migrated, error: migrationError } = await supabase
    .from('user_daily_protocols')
    .insert(drafts.map((draft) => toRow(draft, userId)))
    .select(columns);
  if (migrationError) throw migrationError;
  window.localStorage.removeItem(legacyStorageKey);
  return ((migrated ?? []) as unknown as ProtocolRow[]).map(fromRow);
}

export async function createDailyProtocol(
  userId: string,
  draft: DailyProtocolDraft,
): Promise<DailyProtocol> {
  const { data, error } = await supabase
    .from('user_daily_protocols')
    .insert(toRow(draft, userId))
    .select(columns)
    .single();
  if (error) throw error;
  return fromRow(data as unknown as ProtocolRow);
}

export async function saveDailyProtocolCheckIn(
  userId: string,
  protocol: DailyProtocol,
): Promise<void> {
  const previous = checkInQueues.get(protocol.id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const payload: Record<string, unknown> = { checked: protocol.checked };
    // Water aggregates are exclusively owned by the audited RPCs. A reminder
    // toggle must never race with a pending water event or overwrite it.
    if (protocol.kind !== 'water') {
      payload.consumed = protocol.waterConsumed ?? {};
      payload.state_date = todayKey();
    }
    const { error } = await supabase
      .from('user_daily_protocols')
      .update(payload)
      .eq('id', protocol.id)
      .eq('user_id', userId)
      .select('id')
      .single();
    if (error) throw error;
  });
  checkInQueues.set(protocol.id, next);
  try {
    await next;
  } finally {
    if (checkInQueues.get(protocol.id) === next) checkInQueues.delete(protocol.id);
  }
}

export async function recordDailyProtocolConsumption(
  protocolId: string,
  slotTime: string,
  amountMl: number,
): Promise<ConsumptionResult> {
  return enqueueConsumption(protocolId, slotTime, async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Sem conexão. O consumo será registrado quando você estiver online.');
    }
    const key = idempotencyKey();
    const params = {
      p_protocol_id: protocolId,
      p_local_date: todayKey(),
      p_slot_time: slotTime,
      p_amount_ml: Math.max(1, Math.round(amountMl)),
      p_idempotency_key: key,
      p_timezone: localTimezone(),
    };
    let data: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await supabase.rpc('record_daily_protocol_consumption', params);
        if (response.error) throw response.error;
        data = response.data as Record<string, unknown>;
        break;
      } catch (error) {
        if (isWaterRateLimitedError(error)) {
          throw new Error(WATER_RATE_LIMIT_MESSAGE, { cause: error });
        }
        if (attempt === 0 && isTransientError(error)) {
          await retryDelay(250);
          continue;
        }
        throw error;
      }
    }
    return {
      consumed: (data?.consumed ?? {}) as Record<string, number>,
      stateDate: (data?.state_date as string | undefined) ?? todayKey(),
      recorded: data?.recorded as boolean | undefined,
      duplicate: data?.duplicate as boolean | undefined,
    };
  });
}

export async function undoDailyProtocolConsumption(
  protocolId: string,
  slotTime: string,
): Promise<ConsumptionResult> {
  return enqueueConsumption(protocolId, slotTime, async () => {
    const key = idempotencyKey();
    const params = {
      p_protocol_id: protocolId,
      p_local_date: todayKey(),
      p_slot_time: slotTime,
      p_idempotency_key: key,
      p_timezone: localTimezone(),
    };
    let data: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await supabase.rpc('undo_daily_protocol_consumption', params);
        if (response.error) throw response.error;
        data = response.data as Record<string, unknown>;
        break;
      } catch (error) {
        if (isWaterRateLimitedError(error)) {
          throw new Error(WATER_RATE_LIMIT_MESSAGE, { cause: error });
        }
        if (attempt === 0 && isTransientError(error)) {
          await retryDelay(250);
          continue;
        }
        throw error;
      }
    }
    return {
      consumed: (data?.consumed ?? {}) as Record<string, number>,
      stateDate: (data?.state_date as string | undefined) ?? todayKey(),
      removed: data?.removed as boolean | undefined,
    };
  });
}

export async function loadDailyProtocolConsumption(protocolId: string): Promise<WaterConsumptionDay> {
  const { error: reconciliationError } = await supabase.rpc('reconcile_daily_protocol_consumption', {
    p_protocol_id: protocolId,
    p_local_date: todayKey(),
    p_timezone: localTimezone(),
  });
  if (reconciliationError) {
    if (isLedgerIntegrityError(reconciliationError)) {
      throw new Error(WATER_RECONCILIATION_MESSAGE, { cause: reconciliationError });
    }
    throw reconciliationError;
  }
  const { data, error } = await supabase.rpc('list_daily_protocol_consumption', {
    p_protocol_id: protocolId,
    p_local_date: todayKey(),
    p_timezone: localTimezone(),
  });
  if (error) throw error;
  const payload = (data ?? {}) as { consumed?: Record<string, number>; events?: Array<Record<string, unknown>> };
  return {
    consumed: payload.consumed ?? {},
    events: (payload.events ?? []).map((event) => ({
      id: String(event.id),
      slotTime: String(event.slot_time),
      amountMl: Number(event.amount_ml) || 0,
      consumedAt: String(event.consumed_at),
    })),
  };
}

function enqueueConsumption(
  protocolId: string,
  slotTime: string,
  operation: () => Promise<ConsumptionResult>,
): Promise<ConsumptionResult> {
  const key = `${protocolId}:${slotTime}`;
  const previous = consumptionQueues.get(key) ?? Promise.resolve({ consumed: {}, stateDate: todayKey() });
  const next = previous.catch(() => ({ consumed: {}, stateDate: todayKey() })).then(operation);
  consumptionQueues.set(key, next);
  void next.then(() => undefined, () => undefined).then(() => {
    if (consumptionQueues.get(key) === next) consumptionQueues.delete(key);
  });
  return next;
}
