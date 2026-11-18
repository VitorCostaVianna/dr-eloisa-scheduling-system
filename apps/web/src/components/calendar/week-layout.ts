import type { CalendarResponse } from "@sistema-agendamento/shared-types";
import { addDays, clinicLocalToIso, localMinuteOf } from "@/lib/clinic-time";

/** Posição em grade de 15 min: `topSlot` a partir de `firstMinute`; `dayIndex` 0 = primeiro dia da semana. */
export interface PositionedItem {
  id: string;
  dayIndex: number;
  topSlot: number;
  spanSlots: number;
}

export const SLOT_MINUTES = 15;
const MINUTES_PER_DAY = 1440;

/**
 * Trecho de [startAt, endAt) que cai em `date`, em minutos locais (0..1440); null se não toca o dia.
 * O fim que coincide com a meia-noite seguinte vale 1440 (localMinuteOf daria 0).
 */
function minutesWithinDay(
  date: string,
  startAt: string,
  endAt: string,
): { start: number; end: number } | null {
  const dayStartMs = Date.parse(clinicLocalToIso(date, "00:00"));
  const nextDayMs = Date.parse(clinicLocalToIso(addDays(date, 1), "00:00"));
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (endMs <= dayStartMs || startMs >= nextDayMs) return null;
  return {
    start: startMs <= dayStartMs ? 0 : localMinuteOf(startAt),
    end: endMs >= nextDayMs ? MINUTES_PER_DAY : localMinuteOf(endAt),
  };
}

export function layoutWeek(
  cal: CalendarResponse,
  opts: { firstMinute: number; lastMinute: number },
): {
  bands: PositionedItem[];
  blocks: PositionedItem[];
  appointments: PositionedItem[];
} {
  const { firstMinute, lastMinute } = opts;

  // Recorta [startAt, endAt) em cada dia da semana e na janela; fora dela, nada.
  function place(
    id: string,
    startAt: string,
    endAt: string,
    dayIndexes?: number[],
  ): PositionedItem[] {
    const items: PositionedItem[] = [];
    for (const dayIndex of dayIndexes ?? cal.days.keys()) {
      const range = minutesWithinDay(cal.days[dayIndex].date, startAt, endAt);
      if (!range) continue;
      const start = Math.max(range.start, firstMinute);
      const end = Math.min(range.end, lastMinute);
      if (end <= start) continue;
      items.push({
        id,
        dayIndex,
        topSlot: Math.floor((start - firstMinute) / SLOT_MINUTES),
        spanSlots: Math.max(1, Math.ceil((end - start) / SLOT_MINUTES)),
      });
    }
    return items;
  }

  const byPosition = (a: PositionedItem, b: PositionedItem) =>
    a.dayIndex - b.dayIndex || a.topSlot - b.topSlot;

  const bands = cal.days
    .flatMap((day, dayIndex) =>
      day.workingHours.flatMap((w, i) =>
        place(`band-${dayIndex}-${i}`, w.startAt, w.endAt, [dayIndex]),
      ),
    )
    .sort(byPosition);
  const blocks = cal.blocks
    .flatMap((b) => place(b.id, b.startAt, b.endAt))
    .sort(byPosition);
  const appointments = cal.appointments
    .flatMap((a) => place(a.id, a.startAt, a.endAt))
    .sort(byPosition);

  return { bands, blocks, appointments };
}
