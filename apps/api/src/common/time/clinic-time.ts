// Único importador de `luxon` no api. Todo cálculo de calendário passa por aqui (guia §7.1).
// Sem `@nestjs/*` porque o domínio puro importa este arquivo.
import { DateTime } from 'luxon';
import { CLINIC_TIME_ZONE } from '@sistema-agendamento/shared-types';

export { CLINIC_TIME_ZONE };

/** Data de calendário 'YYYY-MM-DD' (sem fuso). */
export type LocalDate = string;

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Datas puras são calculadas em UTC: sem horário de verão, o dia sempre tem 24h.
function parseLocalDate(date: LocalDate): DateTime {
  const parsed = DateTime.fromISO(date, { zone: 'utc' });
  if (!LOCAL_DATE_RE.test(date) || !parsed.isValid) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return parsed;
}

/** Formato + data real (2026-02-30 → false). */
export function isValidLocalDate(s: string): boolean {
  return LOCAL_DATE_RE.test(s) && DateTime.fromISO(s, { zone: 'utc' }).isValid;
}

export function localDateOf(
  instant: Date,
  tz: string = CLINIC_TIME_ZONE,
): LocalDate {
  return DateTime.fromJSDate(instant, { zone: tz }).toFormat('yyyy-MM-dd');
}

/** Minutos desde 00:00 local, 0..1439. */
export function localMinuteOf(
  instant: Date,
  tz: string = CLINIC_TIME_ZONE,
): number {
  const dt = DateTime.fromJSDate(instant, { zone: tz });
  return dt.hour * 60 + dt.minute;
}

/** 0 = domingo. */
export function dayOfWeekOf(date: LocalDate): number {
  return parseLocalDate(date).weekday % 7; // Luxon: 1 = segunda ... 7 = domingo
}

/**
 * `minute` em 0..1440; 1440 = 00:00 do dia seguinte. Monta a partir dos campos
 * locais (não "meia-noite + N minutos"), senão dia de troca de horário desloca a hora.
 * Hora inexistente (salto do horário de verão) segue o padrão do Luxon: avança.
 */
export function instantAt(
  date: LocalDate,
  minute: number,
  tz: string = CLINIC_TIME_ZONE,
): Date {
  const d = parseLocalDate(date);
  const dt = DateTime.fromObject(
    { year: d.year, month: d.month, day: d.day, hour: 0, minute: 0 },
    { zone: tz },
  );
  // Soma de calendário (hours/minutes locais), não de duração absoluta.
  const day = minute >= 1440 ? dt.plus({ days: 1 }) : dt;
  const rest = minute >= 1440 ? minute - 1440 : minute;
  return day.set({ hour: Math.floor(rest / 60), minute: rest % 60 }).toJSDate();
}

export function startOfLocalDay(
  date: LocalDate,
  tz: string = CLINIC_TIME_ZONE,
): Date {
  return instantAt(date, 0, tz);
}

export function addLocalDays(date: LocalDate, n: number): LocalDate {
  return parseLocalDate(date).plus({ days: n }).toFormat('yyyy-MM-dd');
}

/** Inclusivo nas duas pontas. */
export function eachLocalDate(from: LocalDate, to: LocalDate): LocalDate[] {
  const total = daysBetweenInclusive(from, to);
  return Array.from({ length: Math.max(total, 0) }, (_, i) =>
    addLocalDays(from, i),
  );
}

export function daysBetweenInclusive(from: LocalDate, to: LocalDate): number {
  return (
    Math.round(parseLocalDate(to).diff(parseLocalDate(from), 'days').days) + 1
  );
}

/** Meia-noite UTC do dia (coluna `@db.Date`). */
export function localDateToDbDate(date: LocalDate): Date {
  return parseLocalDate(date).toJSDate();
}

export function dbDateToLocalDate(d: Date): LocalDate {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}
