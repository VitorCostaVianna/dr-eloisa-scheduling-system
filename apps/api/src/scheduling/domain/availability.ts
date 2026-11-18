import { GRID_STEP_MINUTES } from '@sistema-agendamento/shared-types';
import {
  dayOfWeekOf,
  eachLocalDate,
  instantAt,
  type LocalDate,
} from '../../common/time/clinic-time';
import type { WeeklyHoursRow } from './default-working-hours';
import { addMinutes, overlaps, type Interval } from './intervals';

export interface AvailabilityInput {
  fromDate: LocalDate;
  toDate: LocalDate;
  weeklyHours: readonly WeeklyHoursRow[];
  blocks: Interval[];
  occupied: Interval[];
  holidays: Map<LocalDate, string>;
  holidayOverrides: Set<LocalDate>;
  durationMinutes: number;
  now: Date;
  timeZone: string;
  gridStepMinutes?: number; // padrão GRID_STEP_MINUTES
}

/** Toda data do intervalo é chave (lista vazia se nada), em ordem cronológica. */
export function computeAvailableStarts(
  i: AvailabilityInput,
): Map<LocalDate, Date[]> {
  const step = i.gridStepMinutes ?? GRID_STEP_MINUTES; // RN-02
  const taken = [...i.blocks, ...i.occupied];
  const result = new Map<LocalDate, Date[]>();

  for (const date of eachLocalDate(i.fromDate, i.toDate)) {
    const starts: Date[] = [];
    result.set(date, starts);
    // RN-07/RN-46: feriado fecha o dia, salvo exceção explícita.
    if (i.holidays.has(date) && !i.holidayOverrides.has(date)) continue;

    const dow = dayOfWeekOf(date);
    for (const row of i.weeklyHours) {
      if (row.dayOfWeek !== dow) continue;
      const windowEnd = instantAt(date, row.endMinute, i.timeZone);
      for (let m = row.startMinute; m < row.endMinute; m += step) {
        const s = instantAt(date, m, i.timeZone);
        if (s <= i.now) continue;
        const e = addMinutes(s, i.durationMinutes);
        if (e > windowEnd) continue;
        const slot: Interval = { start: s, end: e };
        if (taken.some((t) => overlaps(slot, t))) continue; // RN-03
        starts.push(s);
      }
    }
    starts.sort((a, b) => a.getTime() - b.getTime());
  }
  return result;
}
