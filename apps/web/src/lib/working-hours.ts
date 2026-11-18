import type { WorkingHoursDto } from '@sistema-agendamento/shared-types';

export interface WeekdaySchedule {
  /** Igual ao da API: 0 (domingo) a 6 (sábado). A lista sai na ordem 1..6, 0. */
  dayOfWeek: number;
  dayName: string;
  /** Faixas 'HH:mm–HH:mm' (en dash) em ordem; vazio = "Sem atendimento". */
  ranges: string[];
}

const DISPLAY_ORDER: readonly { dayOfWeek: number; dayName: string }[] = [
  { dayOfWeek: 1, dayName: 'Segunda-feira' },
  { dayOfWeek: 2, dayName: 'Terça-feira' },
  { dayOfWeek: 3, dayName: 'Quarta-feira' },
  { dayOfWeek: 4, dayName: 'Quinta-feira' },
  { dayOfWeek: 5, dayName: 'Sexta-feira' },
  { dayOfWeek: 6, dayName: 'Sábado' },
  { dayOfWeek: 0, dayName: 'Domingo' },
];

/** Minutos desde 00:00 -> 'HH:mm' (ex.: 810 -> '13:30'). */
export function formatMinutes(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Agrupa as faixas por dia, segunda a domingo, ordenadas por início. */
export function groupWorkingHours(rows: readonly WorkingHoursDto[]): WeekdaySchedule[] {
  return DISPLAY_ORDER.map(({ dayOfWeek, dayName }) => ({
    dayOfWeek,
    dayName,
    ranges: rows
      .filter((r) => r.dayOfWeek === dayOfWeek)
      .sort((a, b) => a.startMinute - b.startMinute)
      .map((r) => `${formatMinutes(r.startMinute)}–${formatMinutes(r.endMinute)}`),
  }));
}

/** 'Segunda-feira 08:00–11:00 · 13:30–17:00' ou 'Sábado Sem atendimento'. */
export function formatWeekdayLine(day: WeekdaySchedule): string {
  const hours = day.ranges.length > 0 ? day.ranges.join(' · ') : 'Sem atendimento';
  return `${day.dayName} ${hours}`;
}
