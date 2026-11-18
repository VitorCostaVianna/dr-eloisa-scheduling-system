import { describe, expect, it } from 'vitest';
import type { CalendarResponse } from '@sistema-agendamento/shared-types';
import { addDays, clinicLocalToIso } from '@/lib/clinic-time';
import { layoutWeek } from './week-layout';

const MONDAY = '2026-11-09';
const WINDOW = { firstMinute: 420, lastMinute: 1140 };
const at = (offset: number, hhmm: string) => clinicLocalToIso(addDays(MONDAY, offset), hhmm);

function calendar(appointments: CalendarResponse['appointments']): CalendarResponse {
  return {
    timeZone: 'America/Sao_Paulo',
    days: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      date: addDays(MONDAY, i),
      dayOfWeek: (i + 1) % 7,
      workingHours: [],
      holiday: null,
    })),
    blocks: [],
    appointments,
  };
}

const appt = (id: string, startAt: string, endAt: string) => ({
  id,
  startAt,
  endAt,
  status: 'CONFIRMED' as const,
  contactName: 'Maria',
  procedureName: null,
  onHoliday: false,
  outsideWorkingHours: false,
});

describe('[W] layoutWeek: bordas da janela', () => {
  it('[W] item que cruza o fim da janela (18:30–19:30) é recortado em 19:00', () => {
    const { appointments } = layoutWeek(
      calendar([appt('a', at(0, '18:30'), at(0, '19:30'))]),
      WINDOW,
    );
    expect(appointments).toEqual([{ id: 'a', dayIndex: 0, topSlot: 46, spanSlots: 2 }]);
  });

  it('[W] item que cruza o início da janela (06:30–07:30) é recortado em 07:00', () => {
    const { appointments } = layoutWeek(
      calendar([appt('a', at(0, '06:30'), at(0, '07:30'))]),
      WINDOW,
    );
    expect(appointments).toEqual([{ id: 'a', dayIndex: 0, topSlot: 0, spanSlots: 2 }]);
  });

  it('[W] ordena agendamentos por dia e depois por horário', () => {
    const { appointments } = layoutWeek(
      calendar([
        appt('c', at(2, '08:00'), at(2, '08:30')),
        appt('b', at(0, '10:00'), at(0, '10:30')),
        appt('a', at(0, '09:00'), at(0, '09:30')),
      ]),
      WINDOW,
    );
    expect(appointments.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
