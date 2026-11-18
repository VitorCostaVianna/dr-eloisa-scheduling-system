import {
  HOLIDAY_YEAR_MAX,
  HOLIDAY_YEAR_MIN,
} from "@sistema-agendamento/shared-types";
import { weekStartOf } from "./clinic-time";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Segunda-feira da semana de `?semana=`; ausente, malformado, inexistente ou fora da faixa
 * de anos da API → semana de `today`. Nunca lança: URL é entrada do usuário.
 */
export function parseWeekStart(
  raw: string | string[] | undefined,
  today: string,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && LOCAL_DATE_RE.test(value)) {
    const year = Number(value.slice(0, 4));
    if (year >= HOLIDAY_YEAR_MIN && year <= HOLIDAY_YEAR_MAX) {
      try {
        return weekStartOf(value);
      } catch {
        // data inexistente (ex.: 2026-02-30): cai no padrão
      }
    }
  }
  return weekStartOf(today);
}
