import type { WearableActivity } from './types';

/** Métricas de saúde de um dia, já agregadas por dia local. */
export interface HealthDay {
  date: string;
  activities: WearableActivity[];
  steps?: number;
  activeKcal?: number;
  restingHr?: number;
  avgHr?: number;
  maxHr?: number;
  hrv?: number;
  sleepMinutes?: number;
  sleepCoreMinutes?: number;
  sleepDeepMinutes?: number;
  sleepRemMinutes?: number;
  sleepAwakeMinutes?: number;
  distanceM?: number;
  exerciseMinutes?: number;
  standMinutes?: number;
  flightsClimbed?: number;
  vo2max?: number;
  spo2Avg?: number;
  spo2Min?: number;
  respiratoryRate?: number;
  /** 0..1 — intensidade do dia para o heatmap (energia ativa + treino). */
  intensity: number;
  hasData: boolean;
}

interface DailySummaryLike {
  date: string;
  metrics: {
    steps?: number;
    active_kcal?: number;
    resting_hr?: number;
    avg_hr?: number;
    max_hr?: number;
    hrv_sdnn?: number;
    sleep_minutes?: number;
    sleep_core_minutes?: number;
    sleep_deep_minutes?: number;
    sleep_rem_minutes?: number;
    sleep_awake_minutes?: number;
    distance_m?: number;
    exercise_minutes?: number;
    stand_minutes?: number;
    flights_climbed?: number;
    vo2max?: number;
    spo2_avg?: number;
    spo2_min?: number;
    respiratory_rate?: number;
  } | null;
}

/**
 * Junta atividades e resumos diários numa linha por dia (chave = dia local, que
 * as duas fontes já usam). A intensidade combina energia ativa e presença de
 * treino, normalizada pelo pico do intervalo — é o que colore o heatmap.
 */
export function buildHealthDays(
  activities: WearableActivity[],
  dailySummaries: DailySummaryLike[],
): Map<string, HealthDay> {
  const days = new Map<string, HealthDay>();

  const ensure = (date: string): HealthDay => {
    let day = days.get(date);
    if (!day) {
      day = { date, activities: [], intensity: 0, hasData: false };
      days.set(date, day);
    }
    return day;
  };

  for (const summary of dailySummaries) {
    const day = ensure(summary.date);
    const m = summary.metrics ?? {};
    day.steps = m.steps;
    day.activeKcal = m.active_kcal;
    day.restingHr = m.resting_hr;
    day.avgHr = m.avg_hr;
    day.maxHr = m.max_hr;
    day.hrv = m.hrv_sdnn;
    day.sleepMinutes = m.sleep_minutes;
    day.sleepCoreMinutes = m.sleep_core_minutes;
    day.sleepDeepMinutes = m.sleep_deep_minutes;
    day.sleepRemMinutes = m.sleep_rem_minutes;
    day.sleepAwakeMinutes = m.sleep_awake_minutes;
    day.distanceM = m.distance_m;
    day.exerciseMinutes = m.exercise_minutes;
    day.standMinutes = m.stand_minutes;
    day.flightsClimbed = m.flights_climbed;
    day.vo2max = m.vo2max;
    day.spo2Avg = m.spo2_avg;
    day.spo2Min = m.spo2_min;
    day.respiratoryRate = m.respiratory_rate;
    day.hasData = true;
  }

  for (const activity of activities) {
    const day = ensure(activity.date);
    day.activities.push(activity);
    day.hasData = true;
  }

  // Normaliza a energia ativa pelo pico do intervalo para dar contraste ao
  // heatmap sem que um dia extremo achate todos os outros.
  const peakKcal = Math.max(1, ...[...days.values()].map((day) => day.activeKcal ?? 0));
  for (const day of days.values()) {
    const energy = (day.activeKcal ?? 0) / peakKcal; // 0..1
    const trained = day.activities.length > 0 ? 0.35 : 0;
    day.intensity = Math.min(1, Math.max(energy * 0.85, trained));
    // Ordena atividades do dia por horário de início (mais cedo primeiro).
    day.activities.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  }

  return days;
}

/** Rótulo curto de sono a partir de minutos (ex.: 7h05). */
export function formatSleep(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}
