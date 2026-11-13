import { HOLIDAY_YEAR_MAX, HOLIDAY_YEAR_MIN } from '@sistema-agendamento/shared-types';

/** Ano de `?ano=`; ausente, malformado ou fora da faixa da API → `fallback`. */
export function parseYear(raw: string | string[] | undefined, fallback: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}$/.test(value)) return fallback;
  const year = Number(value);
  return year >= HOLIDAY_YEAR_MIN && year <= HOLIDAY_YEAR_MAX ? year : fallback;
}
