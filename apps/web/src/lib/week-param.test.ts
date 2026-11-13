import { describe, expect, it } from 'vitest';
import { parseWeekStart } from './week-param';

const TODAY = '2026-11-12'; // quinta; segunda = 2026-11-09

describe('[W] parseWeekStart', () => {
  it('[W] data válida vira a segunda-feira da semana dela', () => {
    expect(parseWeekStart('2026-12-08', TODAY)).toBe('2026-12-07');
    expect(parseWeekStart('2026-12-07', TODAY)).toBe('2026-12-07');
  });

  it('[W] ausente, malformado, inexistente ou array vazio mostra a semana de hoje', () => {
    for (const raw of [undefined, '', 'abc', '2026-13-45', '2026-02-30', '2026-1-1', ['x']]) {
      expect(parseWeekStart(raw, TODAY)).toBe('2026-11-09');
    }
  });

  it('[W] usa o primeiro valor de uma lista', () => {
    expect(parseWeekStart(['2026-12-08', 'x'], TODAY)).toBe('2026-12-07');
  });

  it('[W] ano fora de 2000–2100 mostra a semana de hoje', () => {
    expect(parseWeekStart('1999-12-31', TODAY)).toBe('2026-11-09');
    expect(parseWeekStart('2101-01-01', TODAY)).toBe('2026-11-09');
  });
});
