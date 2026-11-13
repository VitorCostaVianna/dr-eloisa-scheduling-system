import { describe, expect, it } from 'vitest';
import { parseYear } from './holiday-year';

describe('[W] parseYear', () => {
  it('[W] ano fora da faixa (1999, 2101) volta ao ano corrente', () => {
    expect(parseYear('1999', 2026)).toBe(2026);
    expect(parseYear('2101', 2026)).toBe(2026);
  });

  it('[W] limites 2000 e 2100 são aceitos', () => {
    expect(parseYear('2000', 2026)).toBe(2000);
    expect(parseYear('2100', 2026)).toBe(2100);
  });

  it('[W] usa o primeiro valor de uma lista; ausente ou malformado volta ao corrente', () => {
    expect(parseYear(['2027', 'x'], 2026)).toBe(2027);
    expect(parseYear(undefined, 2026)).toBe(2026);
    expect(parseYear('abc', 2026)).toBe(2026);
  });
});
