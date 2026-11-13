import { addLocalDays, type LocalDate } from '../../common/time/clinic-time';

/** Domingo de Páscoa do ano (Meeus/Jones/Butcher, aritmética inteira). */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(n: number, size: number): string {
  return String(n).padStart(size, '0');
}

/**
 * Feriados nacionais + Belo Horizonte + segunda/terça de Carnaval (spec 9.4, RN-08/RN-09).
 * ATENÇÃO: a lista municipal precisa ser confirmada no decreto da PBH do ano.
 * Datas coincidentes têm os nomes unidos por " / ", na ordem desta tabela.
 */
export function clinicHolidays(year: number): Map<LocalDate, string> {
  const easter = easterSunday(year);
  const fixed = (mmdd: string): LocalDate => `${pad(year, 4)}-${mmdd}`;
  const table: Array<[LocalDate, string]> = [
    [fixed('01-01'), 'Confraternização Universal'],
    [addLocalDays(easter, -48), 'Carnaval (segunda-feira)'],
    [addLocalDays(easter, -47), 'Carnaval (terça-feira)'],
    [addLocalDays(easter, -2), 'Sexta-feira da Paixão'],
    [fixed('04-21'), 'Tiradentes'],
    [fixed('05-01'), 'Dia do Trabalho'],
    [addLocalDays(easter, 60), 'Corpus Christi'],
    [fixed('08-15'), 'Assunção de Nossa Senhora'],
    [fixed('09-07'), 'Independência do Brasil'],
    [fixed('10-12'), 'Nossa Senhora Aparecida'],
    [fixed('11-02'), 'Finados'],
    [fixed('11-15'), 'Proclamação da República'],
    [fixed('11-20'), 'Dia Nacional de Zumbi e da Consciência Negra'],
    [fixed('12-08'), 'Imaculada Conceição'],
    [fixed('12-25'), 'Natal'],
  ];
  const result = new Map<LocalDate, string>();
  for (const [date, name] of table) {
    const existing = result.get(date);
    result.set(date, existing ? `${existing} / ${name}` : name);
  }
  return result;
}

/** Une os feriados de todos os anos que aparecem em `dates` (cada ano calculado uma vez). */
export function holidaysForDates(dates: LocalDate[]): Map<LocalDate, string> {
  const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
  const result = new Map<LocalDate, string>();
  for (const year of years) {
    for (const [date, name] of clinicHolidays(year)) result.set(date, name);
  }
  return result;
}
