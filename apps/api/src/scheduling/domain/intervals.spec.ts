import { overlaps } from './intervals';
import { clinicInstant } from '../../../test/support/clock';

const iv = (a: string, b: string) => ({
  start: clinicInstant(`2026-11-09 ${a}`),
  end: clinicInstant(`2026-11-09 ${b}`),
});

describe('[RN-03] intervalos semiabertos [início, fim)', () => {
  it('fim de um igual ao início do outro não sobrepõe', () => {
    expect(overlaps(iv('09:00', '10:00'), iv('10:00', '11:00'))).toBe(false);
    expect(overlaps(iv('10:00', '11:00'), iv('09:00', '10:00'))).toBe(false);
  });

  it('sobreposição parcial, contenção e igualdade sobrepõem', () => {
    expect(overlaps(iv('09:00', '10:00'), iv('09:30', '10:30'))).toBe(true);
    expect(overlaps(iv('09:00', '12:00'), iv('10:00', '11:00'))).toBe(true);
    expect(overlaps(iv('09:00', '10:00'), iv('09:00', '10:00'))).toBe(true);
  });

  it('intervalos disjuntos não sobrepõem', () => {
    expect(overlaps(iv('08:00', '09:00'), iv('10:00', '11:00'))).toBe(false);
  });
});
