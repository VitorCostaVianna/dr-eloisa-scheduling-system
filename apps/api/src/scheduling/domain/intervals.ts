/** Intervalo semiaberto [start, end) (RN-03). */
export interface Interval {
  start: Date;
  end: Date;
}

/** RN-03: semiaberto, então fim == início do outro não sobrepõe. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Soma minutos absolutos a um instante. Não lê o relógio: só deriva um Date
 * de outro (o domínio proíbe `new Date()` para "agora").
 */
export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
