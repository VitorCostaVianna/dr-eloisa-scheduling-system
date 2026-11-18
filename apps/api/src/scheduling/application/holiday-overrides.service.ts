import { Injectable, Logger } from '@nestjs/common';
import type {
  HolidayDto,
  HolidayOverrideDto,
} from '@sistema-agendamento/shared-types';
import { DomainError } from '../../common/errors/domain-error';
import { lockSchedule } from '../../common/prisma/advisory-lock';
import type { LocalDate } from '../../common/time/clinic-time';
import { PrismaService } from '../../prisma/prisma.service';
import { clinicHolidays } from '../domain/holidays';
import { HolidayOverrideRepository } from '../infra/holiday-override.repository';

@Injectable()
export class HolidayOverridesService {
  private readonly logger = new Logger(HolidayOverridesService.name);

  constructor(
    private readonly overrides: HolidayOverrideRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** clinicHolidays(year) + desbloqueios do ano; por data. `year` já vem limitado a 2000–2100 pela borda. */
  async listHolidays(
    professionalId: string,
    year: number,
  ): Promise<HolidayDto[]> {
    const rows = await this.overrides.findInRange(
      professionalId,
      `${year}-01-01`,
      `${year}-12-31`,
    );
    const overridden = new Set(rows.map((r) => r.date));
    return [...clinicHolidays(year)]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, name]) => ({
        date,
        name,
        overridden: overridden.has(date),
      }));
  }

  /**
   * Data que não é feriado → NOT_A_HOLIDAY (422). Idempotente.
   * Sem lock: desbloquear só abre horário, não cria conflito (arquitetura 2.8).
   */
  async override(
    professionalId: string,
    date: LocalDate,
  ): Promise<HolidayOverrideDto> {
    if (!clinicHolidays(Number(date.slice(0, 4))).has(date)) {
      throw new DomainError('NOT_A_HOLIDAY');
    }
    const row = await this.overrides.upsert(professionalId, date);
    return { id: row.id, date: row.date };
  }

  /** Idempotente (0 linhas também resolve). Agendamentos do dia não mudam (RN-46). */
  async undoOverride(professionalId: string, date: LocalDate): Promise<void> {
    const count = await this.prisma.$transaction(async (tx) => {
      await lockSchedule(tx, professionalId);
      return this.overrides.delete(tx, professionalId, date);
    });
    if (count > 0) {
      this.logger.log({ event: 'holiday_override.deleted', date });
    }
  }
}
