import {
  dayOfWeekOf,
  instantAt,
  localDateOf,
  type LocalDate,
} from '../../common/time/clinic-time';
import type { WeeklyHoursRow } from './default-working-hours';
import type { Interval } from './intervals';

/** RN-07/RN-46: o dia do início é feriado e não foi desbloqueado. */
export function isOnClosedHoliday(
  startAt: Date,
  holidays: ReadonlyMap<LocalDate, string>,
  overrides: ReadonlySet<LocalDate>,
  timeZone: string,
): boolean {
  const date = localDateOf(startAt, timeZone);
  return holidays.has(date) && !overrides.has(date);
}

/**
 * RN-45: fora do horário se [start, end) não cabe inteiro numa faixa semanal do dia
 * do início. Independe de feriado (a faixa semanal é a regra, o feriado é outro sinal).
 */
export function isOutsideWorkingHours(
  appt: Interval,
  weeklyHours: readonly WeeklyHoursRow[],
  timeZone: string,
): boolean {
  const date = localDateOf(appt.start, timeZone);
  const dow = dayOfWeekOf(date);
  return !weeklyHours.some(
    (row) =>
      row.dayOfWeek === dow &&
      instantAt(date, row.startMinute, timeZone) <= appt.start &&
      appt.end <= instantAt(date, row.endMinute, timeZone),
  );
}
