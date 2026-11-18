// Tabela da RN-01: fonte única para o seed e para os testes.
export interface WeeklyHoursRow {
  dayOfWeek: number; // 0 (domingo) a 6 (sábado)
  startMinute: number;
  endMinute: number;
}

const MONDAY: readonly WeeklyHoursRow[] = [
  { dayOfWeek: 1, startMinute: 480, endMinute: 660 },
  { dayOfWeek: 1, startMinute: 810, endMinute: 1020 },
];
const TUESDAY: readonly WeeklyHoursRow[] = [
  { dayOfWeek: 2, startMinute: 480, endMinute: 660 },
  { dayOfWeek: 2, startMinute: 810, endMinute: 990 },
];

export const DEFAULT_WEEKLY_HOURS: readonly WeeklyHoursRow[] = [
  ...MONDAY,
  ...TUESDAY,
  ...MONDAY.map((r) => ({ ...r, dayOfWeek: 3 })),
  ...TUESDAY.map((r) => ({ ...r, dayOfWeek: 4 })),
  { dayOfWeek: 5, startMinute: 480, endMinute: 630 },
];
