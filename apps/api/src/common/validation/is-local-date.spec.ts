import { validateSync } from 'class-validator';
import { IsLocalDate } from './is-local-date';

class Dto {
  constructor(public d: unknown) {}
}
IsLocalDate()(Dto.prototype, 'd');

const valid = (v: unknown) => validateSync(new Dto(v)).length === 0;

describe('IsLocalDate', () => {
  it('recusa o ano 0000 (addLocalDays(-1) geraria ano negativo)', () => {
    expect(valid('0000-01-01')).toBe(false);
  });
  it('aceita 0001-01-01 e 9998-12-31', () => {
    expect(valid('0001-01-01')).toBe(true);
    expect(valid('9998-12-31')).toBe(true);
  });
  it('recusa 9999-01-01, data inexistente e não-string', () => {
    expect(valid('9999-01-01')).toBe(false);
    expect(valid('2026-02-30')).toBe(false);
    expect(valid(20260101)).toBe(false);
  });
});
