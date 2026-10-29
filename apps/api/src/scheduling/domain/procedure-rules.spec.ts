import {
  isValidProcedureDuration,
  resolveDurationMinutes,
} from './procedure-rules';

describe('[RN-04] duração padrão sem procedimento', () => {
  // CA-1.6: Dado sem procedimento, então a duração usada é 30 min (RN-04).
  it('[CA-1.6] sem procedimento a duração é 30 min', () => {
    expect(resolveDurationMinutes(null)).toBe(30);
  });

  it('com procedimento usa a duração dele', () => {
    expect(resolveDurationMinutes({ durationMinutes: 60 })).toBe(60);
  });
});

describe('[RN-05] durações válidas de procedimento', () => {
  it.each([30, 60, 90])('%i min é válido', (m) => {
    expect(isValidProcedureDuration(m)).toBe(true);
  });

  it.each([45, 120, 0])('%i min é inválido', (m) => {
    expect(isValidProcedureDuration(m)).toBe(false);
  });
});
