import { describe, expect, it } from "vitest";
import type {
  BlockDto,
  CalendarAppointmentDto,
  CalendarDayDto,
  CalendarResponse,
} from "@sistema-agendamento/shared-types";
import { addDays, clinicLocalToIso } from "@/lib/clinic-time";
import { layoutWeek, type PositionedItem } from "./week-layout";

// Camada W. Semana de segunda 09/11/2026 a domingo 15/11/2026. Instantes sempre pela
// clinic-time (nunca ISO com Z escrito à mão), para o teste pegar erro de fuso.
const MONDAY = "2026-11-09";
const WINDOW = { firstMinute: 420, lastMinute: 1140 }; // 07:00–19:00

const at = (dayOffset: number, hhmm: string) =>
  clinicLocalToIso(addDays(MONDAY, dayOffset), hhmm);

function day(offset: number, hours: [string, string][] = []): CalendarDayDto {
  return {
    date: addDays(MONDAY, offset),
    dayOfWeek: (offset + 1) % 7,
    workingHours: hours.map(([s, e]) => ({
      startAt: at(offset, s),
      endAt: at(offset, e),
    })),
    holiday: null,
  };
}

function appointment(
  id: string,
  startAt: string,
  endAt: string,
): CalendarAppointmentDto {
  return {
    id,
    startAt,
    endAt,
    status: "CONFIRMED",
    contactName: "Maria",
    procedureName: "Limpeza",
    onHoliday: false,
    outsideWorkingHours: false,
  };
}

function block(id: string, startAt: string, endAt: string): BlockDto {
  return { id, startAt, endAt, reason: "Plantão", createdAt: at(0, "00:00") };
}

function calendar(over: Partial<CalendarResponse> = {}): CalendarResponse {
  return {
    timeZone: "America/Sao_Paulo",
    days: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i)),
    blocks: [],
    appointments: [],
    ...over,
  };
}

const geom = (items: PositionedItem[]) =>
  items.map(({ dayIndex, topSlot, spanSlots }) => ({
    dayIndex,
    topSlot,
    spanSlots,
  }));

describe("[W] posição dos itens na grade semanal", () => {
  it("[W] agendamento de segunda 09:00–10:00 com firstMinute 420 fica em dayIndex 0, topSlot 8, spanSlots 4", () => {
    // Dado
    const cal = calendar({
      appointments: [appointment("a1", at(0, "09:00"), at(0, "10:00"))],
    });
    // Quando
    const { appointments } = layoutWeek(cal, WINDOW);
    // Então
    expect(appointments).toEqual([
      { id: "a1", dayIndex: 0, topSlot: 8, spanSlots: 4 },
    ]);
  });

  it("[W] a hora vem do fuso da clínica, não do UTC: 22:00 de segunda (01:00Z de terça) fica em dayIndex 0", () => {
    // Dado
    const cal = calendar({
      appointments: [appointment("a1", at(0, "22:00"), at(0, "22:30"))],
    });
    // Quando
    const { appointments } = layoutWeek(cal, {
      firstMinute: 420,
      lastMinute: 1380,
    });
    // Então 22:00 = minuto 1320 → (1320 − 420) / 15 = 60
    expect(appointments).toEqual([
      { id: "a1", dayIndex: 0, topSlot: 60, spanSlots: 2 },
    ]);
  });

  it("[W] o topSlot é relativo ao firstMinute da janela", () => {
    // Dado a janela começando às 08:00
    const cal = calendar({
      appointments: [appointment("a1", at(2, "09:00"), at(2, "09:30"))],
    });
    // Quando
    const { appointments } = layoutWeek(cal, {
      firstMinute: 480,
      lastMinute: 1140,
    });
    // Então
    expect(appointments).toEqual([
      { id: "a1", dayIndex: 2, topSlot: 4, spanSlots: 2 },
    ]);
  });

  it("[W] agendamentos inteiramente fora da janela 07:00–19:00 não entram na grade", () => {
    // Dado um das 06:00 às 06:30 e outro das 19:00 às 19:30
    const cal = calendar({
      appointments: [
        appointment("antes", at(0, "06:00"), at(0, "06:30")),
        appointment("depois", at(0, "19:00"), at(0, "19:30")),
        appointment("dentro", at(0, "07:00"), at(0, "07:15")),
      ],
    });
    // Quando
    const { appointments } = layoutWeek(cal, WINDOW);
    // Então só o de dentro
    expect(appointments).toEqual([
      { id: "dentro", dayIndex: 0, topSlot: 0, spanSlots: 1 },
    ]);
  });
});

describe("[W] bloqueios recortados por dia", () => {
  it("[W] bloqueio de sexta 16:00 a sábado 09:00 vira 2 itens (um por dia)", () => {
    // Dado
    const cal = calendar({
      blocks: [block("b1", at(4, "16:00"), at(5, "09:00"))],
    });
    // Quando
    const { blocks } = layoutWeek(cal, WINDOW);
    // Então sexta: 16:00 até o fim da janela; sábado: do início da janela até 09:00
    expect(blocks).toEqual([
      { id: "b1", dayIndex: 4, topSlot: 36, spanSlots: 12 },
      { id: "b1", dayIndex: 5, topSlot: 0, spanSlots: 8 },
    ]);
  });

  it("[W] bloqueio que começa antes da semana só ocupa os dias dentro dela", () => {
    // Dado um bloqueio de domingo anterior 20:00 a segunda 09:00
    const cal = calendar({
      blocks: [block("b1", at(-1, "20:00"), at(0, "09:00"))],
    });
    // Quando
    const { blocks } = layoutWeek(cal, WINDOW);
    // Então só segunda, 07:00–09:00
    expect(blocks).toEqual([
      { id: "b1", dayIndex: 0, topSlot: 0, spanSlots: 8 },
    ]);
  });

  it("[W] bloqueio de dia inteiro cobre a janela inteira nos dias atingidos", () => {
    // Dado terça 00:00 a quinta 00:00 (terça e quarta)
    const cal = calendar({
      blocks: [block("b1", at(1, "00:00"), at(3, "00:00"))],
    });
    // Quando
    const { blocks } = layoutWeek(cal, WINDOW);
    // Então 07:00–19:00 = 48 slots em cada dia
    expect(geom(blocks)).toEqual([
      { dayIndex: 1, topSlot: 0, spanSlots: 48 },
      { dayIndex: 2, topSlot: 0, spanSlots: 48 },
    ]);
  });
});

describe("[RN-01] faixas de atendimento", () => {
  it("[W] cada faixa de trabalho vira um item no dia certo (segunda 08:00–11:00 e 13:30–17:00)", () => {
    // Dado
    const cal = calendar({
      days: [
        day(0, [
          ["08:00", "11:00"],
          ["13:30", "17:00"],
        ]),
        day(1),
        day(2, [["08:00", "11:00"]]),
        day(3),
        day(4),
        day(5),
        day(6),
      ],
    });
    // Quando
    const { bands } = layoutWeek(cal, WINDOW);
    // Então
    expect(geom(bands)).toEqual([
      { dayIndex: 0, topSlot: 4, spanSlots: 12 },
      { dayIndex: 0, topSlot: 26, spanSlots: 14 },
      { dayIndex: 2, topSlot: 4, spanSlots: 12 },
    ]);
  });

  it("[W] dia sem horário de atendimento não gera faixa", () => {
    // Dado a semana sem nenhuma faixa
    // Quando
    const { bands } = layoutWeek(calendar(), WINDOW);
    // Então
    expect(bands).toEqual([]);
  });
});
