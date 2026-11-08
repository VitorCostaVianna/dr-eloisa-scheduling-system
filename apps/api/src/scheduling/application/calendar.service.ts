import { Injectable } from '@nestjs/common';
import {
  AVAILABILITY_MAX_DAYS,
  type CalendarAppointmentDto,
  type CalendarDayDto,
} from '@sistema-agendamento/shared-types';
import {
  addLocalDays,
  CLINIC_TIME_ZONE,
  dayOfWeekOf,
  eachLocalDate,
  instantAt,
  startOfLocalDay,
  type LocalDate,
} from '../../common/time/clinic-time';
import {
  isOnClosedHoliday,
  isOutsideWorkingHours,
} from '../domain/calendar-flags';
import { assertLocalRange } from '../../common/validation/assert-local-range';
import { holidaysForDates } from '../domain/holidays';
import { AppointmentReadRepository } from '../infra/appointment-read.repository';
import { HolidayOverrideRepository } from '../infra/holiday-override.repository';
import { BlockRecord, ScheduleRepository } from '../infra/schedule.repository';

const MIN_DATE = '0001-01-01';

/** Resultado do caso de uso; o controller molda o JSON (blocos viram BlockDto no presenter). */
export interface CalendarView {
  timeZone: string;
  days: CalendarDayDto[];
  blocks: BlockRecord[];
  appointments: CalendarAppointmentDto[];
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly schedule: ScheduleRepository,
    private readonly overrides: HolidayOverrideRepository,
    private readonly appointments: AppointmentReadRepository,
  ) {}

  async getCalendar(
    professionalId: string,
    q: { from: LocalDate; to: LocalDate },
  ): Promise<CalendarView> {
    assertLocalRange(q.from, q.to, AVAILABILITY_MAX_DAYS);
    const windowStart = startOfLocalDay(q.from);
    const windowEnd = startOfLocalDay(addLocalDays(q.to, 1));

    // Agendamento dura ≤ 480 min (MANUAL_MAX_MINUTES): um que começa na véspera e cruza a meia-noite
    // precisa do feriado/desbloqueio do dia anterior; por isso [from-1, to] no mesmo Promise.all.
    // Ano 1 é o mínimo aceito pela borda: não existe véspera de 0001-01-01.
    const dayBefore = q.from > MIN_DATE ? addLocalDays(q.from, -1) : q.from;
    const [weeklyHours, blocks, appts, overrideRows] = await Promise.all([
      this.schedule.findWorkingHours(professionalId),
      this.schedule.findBlocksIntersecting(
        professionalId,
        windowStart,
        windowEnd,
      ),
      this.appointments.findOccupyingIntersecting(
        professionalId,
        windowStart,
        windowEnd,
      ),
      this.overrides.findInRange(professionalId, dayBefore, q.to),
    ]);

    const dates = eachLocalDate(q.from, q.to);
    const holidays = holidaysForDates([dayBefore, ...dates]);
    const overridden = new Set(overrideRows.map((o) => o.date));

    return {
      timeZone: CLINIC_TIME_ZONE,
      days: dates.map((date) => {
        const dow = dayOfWeekOf(date);
        const name = holidays.get(date);
        return {
          date,
          dayOfWeek: dow,
          workingHours: weeklyHours
            .filter((r) => r.dayOfWeek === dow)
            .map((r) => ({
              startAt: instantAt(date, r.startMinute).toISOString(),
              endAt: instantAt(date, r.endMinute).toISOString(),
            })),
          holiday:
            name === undefined
              ? null
              : { name, overridden: overridden.has(date) },
        };
      }),
      blocks,
      appointments: appts.map((a) => ({
        id: a.id,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        status: a.status,
        contactName: a.contactName,
        procedureName: a.procedureName,
        onHoliday: isOnClosedHoliday(
          a.startAt,
          holidays,
          overridden,
          CLINIC_TIME_ZONE,
        ),
        outsideWorkingHours: isOutsideWorkingHours(
          { start: a.startAt, end: a.endAt },
          weeklyHours,
          CLINIC_TIME_ZONE,
        ),
      })),
    };
  }
}
