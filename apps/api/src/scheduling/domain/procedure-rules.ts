import {
  DEFAULT_DURATION_MINUTES,
  PROCEDURE_DURATIONS,
} from '@sistema-agendamento/shared-types';

/** RN-04: sem procedimento, a consulta dura 30 min. */
export function resolveDurationMinutes(
  procedure: { durationMinutes: number } | null,
): number {
  return procedure ? procedure.durationMinutes : DEFAULT_DURATION_MINUTES;
}

/** RN-05: só 30, 60 ou 90. */
export function isValidProcedureDuration(minutes: number): boolean {
  return (PROCEDURE_DURATIONS as readonly number[]).includes(minutes);
}
