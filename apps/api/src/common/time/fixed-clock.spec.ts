import {
  BASE_NOW,
  clinicInstant,
  FixedClock,
} from '../../../test/support/clock';

describe('FixedClock', () => {
  it('now() devolve o instante inicial', () => {
    const d = new Date('2026-11-09T11:00:00.000Z');
    expect(new FixedClock(d).now().toISOString()).toBe(d.toISOString());
  });

  it('advance(30) soma 30 minutos', () => {
    const clock = new FixedClock(new Date('2026-11-09T11:00:00.000Z'));
    clock.advance(30);
    expect(clock.now().toISOString()).toBe('2026-11-09T11:30:00.000Z');
  });
});

describe('clinicInstant', () => {
  it('interpreta o horário no fuso da clínica', () => {
    expect(clinicInstant('2026-11-09 08:00').toISOString()).toBe(
      '2026-11-09T11:00:00.000Z',
    );
  });
});

describe('BASE_NOW', () => {
  it('é 2026-11-01 12:00 na clínica', () => {
    expect(BASE_NOW.toISOString()).toBe('2026-11-01T15:00:00.000Z');
  });
});
