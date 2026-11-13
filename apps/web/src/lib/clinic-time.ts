// Único importador de `luxon` no web (regra de lint; guia §7.1). Todo cálculo de calendário
// passa por aqui, sempre no fuso da clínica, nunca no do navegador/Node.
import { DateTime } from 'luxon';
import { CLINIC_TIME_ZONE } from '@sistema-agendamento/shared-types';

const LOCALE = 'pt-BR';
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^\d{2}:\d{2}$/;

function inClinic(instantIso: string): DateTime {
  const dt = DateTime.fromISO(instantIso, { zone: CLINIC_TIME_ZONE });
  if (!dt.isValid) throw new Error(`Invalid instant: ${instantIso}`);
  return dt;
}

// Datas puras são calculadas em UTC: sem horário de verão, o dia sempre tem 24h.
function parseLocalDate(date: string): DateTime {
  const dt = DateTime.fromISO(date, { zone: 'utc' });
  if (!LOCAL_DATE_RE.test(date) || !dt.isValid) throw new Error(`Invalid local date: ${date}`);
  return dt;
}

/** Dia de calendário 'YYYY-MM-DD' (no fuso da clínica) em que cai o instante ISO UTC. */
export function localDateOf(instantIso: string): string {
  return inClinic(instantIso).toFormat('yyyy-MM-dd');
}

/** Minutos desde 00:00 local, 0..1439. */
export function localMinuteOf(instantIso: string): number {
  const dt = inClinic(instantIso);
  return dt.hour * 60 + dt.minute;
}

/** 'HH:mm' no fuso da clínica (ex.: '08:00'). */
export function formatClinicTime(instantIso: string): string {
  return inClinic(instantIso).toFormat('HH:mm');
}

/** Ex.: 'segunda-feira, 9 de novembro' (pt-BR). */
export function formatClinicDate(date: string): string {
  return parseLocalDate(date).setLocale(LOCALE).toFormat("cccc, d 'de' LLLL");
}

/** Segunda-feira da semana que contém `date` ('YYYY-MM-DD'). */
export function weekStartOf(date: string): string {
  const dt = parseLocalDate(date);
  return dt.minus({ days: dt.weekday - 1 }).toFormat('yyyy-MM-dd');
}

export function addDays(date: string, n: number): string {
  return parseLocalDate(date).plus({ days: n }).toFormat('yyyy-MM-dd');
}

/** Hoje no fuso da clínica. Lê o relógio do sistema: só para uso na borda (Server Component/cliente). */
export function todayInClinic(): string {
  return DateTime.now().setZone(CLINIC_TIME_ZONE).toFormat('yyyy-MM-dd');
}

/** Instante ISO UTC de `date` ('YYYY-MM-DD') + `hhmm` ('HH:mm') no fuso da clínica. */
export function clinicLocalToIso(date: string, hhmm: string): string {
  if (!LOCAL_DATE_RE.test(date) || !LOCAL_TIME_RE.test(hhmm)) {
    throw new Error(`Invalid local date/time: ${date} ${hhmm}`);
  }
  const dt = DateTime.fromISO(`${date}T${hhmm}`, { zone: CLINIC_TIME_ZONE });
  if (!dt.isValid) throw new Error(`Invalid local date/time: ${date} ${hhmm}`);
  return dt.toUTC().toISO() as string;
}
