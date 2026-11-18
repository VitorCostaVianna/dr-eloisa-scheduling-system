import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_MAX_DAYS,
  type AvailabilityResponse,
} from '@sistema-agendamento/shared-types';
import { DomainError } from '../../common/errors/domain-error';
import { assertLocalRange } from '../../common/validation/assert-local-range';
import { CLOCK, type Clock } from '../../common/time/clock';
import {
  addLocalDays,
  CLINIC_TIME_ZONE,
  eachLocalDate,
  startOfLocalDay,
  type LocalDate,
} from '../../common/time/clinic-time';
import { computeAvailableStarts } from '../domain/availability';
import { holidaysForDates } from '../domain/holidays';
import { resolveDurationMinutes } from '../domain/procedure-rules';
import { AppointmentReadRepository } from '../infra/appointment-read.repository';
import { HolidayOverrideRepository } from '../infra/holiday-override.repository';
import { ProcedureRepository } from '../infra/procedure.repository';
import { ScheduleRepository } from '../infra/schedule.repository';
import { ProfessionalContextService } from './professional-context.service';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly context: ProfessionalContextService,
    private readonly procedures: ProcedureRepository,
    private readonly schedule: ScheduleRepository,
    private readonly overrides: HolidayOverrideRepository,
    private readonly appointments: AppointmentReadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Só leitura, sem lock. Resposta pública: só datas e inícios (spec 10.3). */
  async getPublicAvailability(q: {
    from: LocalDate;
    to: LocalDate;
    serviceId?: string;
  }): Promise<AvailabilityResponse> {
    assertLocalRange(q.from, q.to, AVAILABILITY_MAX_DAYS);
    const professionalId = await this.context.forPublic();

    let procedure: { durationMinutes: number } | null = null;
    if (q.serviceId) {
      const found = await this.procedures.findOne(professionalId, q.serviceId);
      if (!found || !found.active) throw new DomainError('PROCEDURE_INACTIVE');
      procedure = found;
    }
    const durationMinutes = resolveDurationMinutes(procedure);

    const dates = eachLocalDate(q.from, q.to);
    const windowStart = startOfLocalDay(q.from);
    const windowEnd = startOfLocalDay(addLocalDays(q.to, 1));
    const [weeklyHours, blocks, occupied, overrideRows] = await Promise.all([
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
      this.overrides.findInRange(professionalId, q.from, q.to),
    ]);

    const starts = computeAvailableStarts({
      fromDate: q.from,
      toDate: q.to,
      weeklyHours,
      blocks: blocks.map((b) => ({ start: b.startAt, end: b.endAt })),
      occupied: occupied.map((a) => ({ start: a.startAt, end: a.endAt })),
      holidays: holidaysForDates(dates),
      holidayOverrides: new Set(overrideRows.map((o) => o.date)),
      durationMinutes,
      now: this.clock.now(),
      timeZone: CLINIC_TIME_ZONE,
    });

    return {
      timeZone: CLINIC_TIME_ZONE,
      durationMinutes,
      days: dates.map((date) => ({
        date,
        starts: (starts.get(date) ?? []).map((d) => d.toISOString()),
      })),
    };
  }
}
