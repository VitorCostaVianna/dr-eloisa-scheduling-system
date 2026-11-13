import { CLINIC_TIME_ZONE, instantAt } from '../../common/time/clinic-time';
import { DEFAULT_WEEKLY_HOURS } from './default-working-hours';
import { isOnClosedHoliday, isOutsideWorkingHours } from './calendar-flags';

const tz = CLINIC_TIME_ZONE;
const at = (d: string, h: number, m = 0) => instantAt(d, h * 60 + m, tz);

describe('isOutsideWorkingHours', () => {
  it('cabe numa faixa: dentro', () => {
    expect(
      isOutsideWorkingHours(
        { start: at('2026-11-09', 9), end: at('2026-11-09', 9, 30) },
        DEFAULT_WEEKLY_HOURS,
        tz,
      ),
    ).toBe(false);
  });

  it('cruza o almoço: fora', () => {
    expect(
      isOutsideWorkingHours(
        { start: at('2026-11-09', 10, 45), end: at('2026-11-09', 11, 15) },
        DEFAULT_WEEKLY_HOURS,
        tz,
      ),
    ).toBe(true);
  });

  it('termina exatamente no fim da faixa: dentro (semiaberto)', () => {
    expect(
      isOutsideWorkingHours(
        { start: at('2026-11-09', 10, 30), end: at('2026-11-09', 11) },
        DEFAULT_WEEKLY_HOURS,
        tz,
      ),
    ).toBe(false);
  });

  it('dia sem faixa (domingo): fora', () => {
    expect(
      isOutsideWorkingHours(
        { start: at('2026-11-08', 9), end: at('2026-11-08', 9, 30) },
        DEFAULT_WEEKLY_HOURS,
        tz,
      ),
    ).toBe(true);
  });
});

describe('isOnClosedHoliday', () => {
  const holidays = new Map([['2026-12-08', 'Imaculada Conceição']]);
  const start = at('2026-12-08', 9);

  it('feriado não desbloqueado: true', () => {
    expect(isOnClosedHoliday(start, holidays, new Set(), tz)).toBe(true);
  });

  it('feriado desbloqueado: false', () => {
    expect(
      isOnClosedHoliday(start, holidays, new Set(['2026-12-08']), tz),
    ).toBe(false);
  });

  it('dia comum: false', () => {
    expect(
      isOnClosedHoliday(at('2026-12-09', 9), holidays, new Set(), tz),
    ).toBe(false);
  });
});
