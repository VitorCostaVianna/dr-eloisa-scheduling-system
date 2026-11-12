// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WorkingHoursDto } from '@sistema-agendamento/shared-types';
import { formatMinutes, formatWeekdayLine, groupWorkingHours } from './working-hours';

// Seed (RN-01). dayOfWeek da API: 0 = domingo.
const range = (dayOfWeek: number, start: string, end: string): WorkingHoursDto => {
  const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  return { dayOfWeek, startMinute: m(start), endMinute: m(end) };
};
const SEED: WorkingHoursDto[] = [
  range(1, '08:00', '11:00'), range(1, '13:30', '17:00'),
  range(2, '08:00', '11:00'), range(2, '13:30', '16:30'),
  range(3, '08:00', '11:00'), range(3, '13:30', '17:00'),
  range(4, '08:00', '11:00'), range(4, '13:30', '16:30'),
  range(5, '08:00', '10:30'),
];

describe('[W] formatMinutes', () => {
  it('[W] 810 -> 13:30', () => expect(formatMinutes(810)).toBe('13:30'));
  it('[W] 480 -> 08:00 (zero à esquerda)', () => expect(formatMinutes(480)).toBe('08:00'));
  it('[W] 0 -> 00:00', () => expect(formatMinutes(0)).toBe('00:00'));
  it('[W] 1020 -> 17:00', () => expect(formatMinutes(1020)).toBe('17:00'));
});

describe('[W] groupWorkingHours', () => {
  it('[W] devolve 7 dias, segunda a domingo, com nomes em pt-BR', () => {
    // Dado o seed
    const days = groupWorkingHours(SEED);
    // Então
    expect(days.map((d) => d.dayName)).toEqual([
      'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
      'Sexta-feira', 'Sábado', 'Domingo',
    ]);
    expect(days.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('[W] faixas do seed por dia, com en dash', () => {
    const days = groupWorkingHours(SEED);
    expect(days.map((d) => d.ranges)).toEqual([
      ['08:00–11:00', '13:30–17:00'],
      ['08:00–11:00', '13:30–16:30'],
      ['08:00–11:00', '13:30–17:00'],
      ['08:00–11:00', '13:30–16:30'],
      ['08:00–10:30'],
      [],
      [],
    ]);
  });

  it('[W] ordena as faixas por início mesmo com a entrada embaralhada', () => {
    // Dado as faixas de segunda fora de ordem
    const days = groupWorkingHours([range(1, '13:30', '17:00'), range(1, '08:00', '11:00')]);
    // Então
    expect(days[0].ranges).toEqual(['08:00–11:00', '13:30–17:00']);
  });

  it('[W] sem linhas: 7 dias, todos sem faixa', () => {
    const days = groupWorkingHours([]);
    expect(days).toHaveLength(7);
    expect(days.every((d) => d.ranges.length === 0)).toBe(true);
  });

  it('[W] dayOfWeek 0 (domingo) vai para o fim da lista', () => {
    const days = groupWorkingHours([range(0, '09:00', '12:00')]);
    expect(days[6].dayName).toBe('Domingo');
    expect(days[6].ranges).toEqual(['09:00–12:00']);
    expect(days[0].ranges).toEqual([]);
  });
});

describe('[W] formatWeekdayLine', () => {
  it('[W] segunda do seed', () => {
    const [segunda] = groupWorkingHours(SEED);
    expect(formatWeekdayLine(segunda)).toBe('Segunda-feira 08:00–11:00 · 13:30–17:00');
  });

  it('[W] sexta do seed (uma faixa)', () => {
    const sexta = groupWorkingHours(SEED)[4];
    expect(formatWeekdayLine(sexta)).toBe('Sexta-feira 08:00–10:30');
  });

  it('[W] sábado e domingo: "Sem atendimento"', () => {
    const days = groupWorkingHours(SEED);
    expect(formatWeekdayLine(days[5])).toBe('Sábado Sem atendimento');
    expect(formatWeekdayLine(days[6])).toBe('Domingo Sem atendimento');
  });
});
