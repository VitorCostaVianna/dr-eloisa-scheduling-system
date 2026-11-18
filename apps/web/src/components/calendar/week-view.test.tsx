import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type {
  BlockDto,
  CalendarAppointmentDto,
  CalendarResponse,
} from '@sistema-agendamento/shared-types';
import { addDays, clinicLocalToIso } from '@/lib/clinic-time';
import { WeekView } from './week-view';

// Camada W. Regressão de layout da agenda semanal (usada por CA-1.6/1.8/1.15/1.19/1.26, que
// não têm critério próprio de geometria; por isso a tag é [W], como em week-layout.test.ts).
// Cada coluna de dia é um grid com `gridTemplateRows`; sem `grid-column` explícito o
// auto-placement do CSS joga o item que sobrepõe linhas para uma coluna implícita nova,
// deslocando-o e estreitando-o. Critério: todo filho direto da coluna ocupa a coluna única
// do dia, ou seja, `grid-column` é '1' ou '1 / -1' (qualquer outro valor falha).
const MONDAY = '2026-11-09';
const WEDNESDAY = 2;
const at = (dayOffset: number, hhmm: string) => clinicLocalToIso(addDays(MONDAY, dayOffset), hhmm);

afterEach(cleanup);

const SINGLE_COLUMN = ['1', '1 / -1', '1 / span 1'];

describe('[W] WeekView: itens de uma coluna de dia ocupam a coluna inteira', () => {
  it('[W] faixa, bloqueio e agendamento sobrepostos na quarta têm grid-column de coluna única', () => {
    const appointment: CalendarAppointmentDto = {
      id: 'a1',
      startAt: at(WEDNESDAY, '14:30'),
      endAt: at(WEDNESDAY, '15:00'),
      status: 'CONFIRMED',
      contactName: 'Maria Teste',
      procedureName: 'Limpeza',
      onHoliday: false,
      outsideWorkingHours: false,
    };
    const blockDto: BlockDto = {
      id: 'b1',
      startAt: at(WEDNESDAY, '14:00'),
      endAt: at(WEDNESDAY, '15:30'),
      reason: 'Plantão',
      createdAt: at(0, '00:00'),
    };
    const calendar: CalendarResponse = {
      timeZone: 'America/Sao_Paulo',
      days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
        date: addDays(MONDAY, i),
        dayOfWeek: (i + 1) % 7,
        workingHours:
          i === WEDNESDAY ? [{ startAt: at(i, '08:00'), endAt: at(i, '18:00') }] : [],
        holiday: null,
      })),
      blocks: [blockDto],
      appointments: [appointment],
    };

    render(<WeekView calendar={calendar} weekStart={MONDAY} />);

    const column = screen.getByRole('list', { name: /quarta/i });
    const children = Array.from(column.children) as HTMLElement[];
    // faixa de atendimento + bloqueio + agendamento
    expect(children).toHaveLength(3);
    expect(children.some((c) => c.className.includes('bg-sky-50'))).toBe(true);
    expect(screen.getByText(/Bloqueado: Plantão/)).toBeTruthy();
    for (const child of children) {
      expect(
        SINGLE_COLUMN,
        `grid-column de <${child.tagName.toLowerCase()} class="${child.className}"> (style="${child.getAttribute('style')}")`,
      ).toContain(child.style.gridColumn);
    }
  });
});
