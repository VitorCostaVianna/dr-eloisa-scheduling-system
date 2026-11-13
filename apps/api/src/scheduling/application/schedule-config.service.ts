import { Injectable, Logger } from '@nestjs/common';
import {
  BLOCKS_LIST_MAX_DAYS,
  type CreateBlockRequest,
  type WorkingHoursDto,
} from '@sistema-agendamento/shared-types';
import { DomainError } from '../../common/errors/domain-error';
import { assertLocalRange } from '../../common/validation/assert-local-range';
import { lockSchedule } from '../../common/prisma/advisory-lock';
import {
  addLocalDays,
  instantAt,
  isValidLocalDate,
  startOfLocalDay,
  type LocalDate,
} from '../../common/time/clinic-time';
import { PrismaService } from '../../prisma/prisma.service';
import { BlockRecord, ScheduleRepository } from '../infra/schedule.repository';

@Injectable()
export class ScheduleConfigService {
  private readonly logger = new Logger(ScheduleConfigService.name);

  constructor(
    private readonly schedule: ScheduleRepository,
    private readonly prisma: PrismaService,
  ) {}

  /** Por dayOfWeek, startMinute. */
  listWorkingHours(professionalId: string): Promise<WorkingHoursDto[]> {
    return this.schedule.findWorkingHours(professionalId);
  }

  /** Bloqueios que intersectam [startOfLocalDay(from), startOfLocalDay(to+1)); máx. 366 dias. */
  listBlocks(
    professionalId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<BlockRecord[]> {
    assertLocalRange(from, to, BLOCKS_LIST_MAX_DAYS);
    return this.schedule.findBlocksIntersecting(
      professionalId,
      startOfLocalDay(from),
      startOfLocalDay(addLocalDays(to, 1)),
    );
  }

  /** $transaction: lockSchedule → insert. Intervalo invertido → VALIDATION_FAILED. */
  async createBlock(
    professionalId: string,
    req: CreateBlockRequest,
  ): Promise<BlockRecord> {
    const { startAt, endAt } = this.resolveRange(req);
    const reason = req.reason?.trim() ? req.reason.trim() : null;
    return this.prisma.$transaction(async (tx) => {
      await lockSchedule(tx, professionalId);
      return this.schedule.insertBlock(tx, professionalId, {
        startAt,
        endAt,
        reason,
      });
    });
  }

  /** Inexistente → NOT_FOUND; log sem o motivo. */
  async deleteBlock(professionalId: string, id: string): Promise<void> {
    const count = await this.schedule.deleteBlock(professionalId, id);
    if (count === 0) throw new DomainError('NOT_FOUND');
    this.logger.log({ event: 'block.deleted', blockId: id });
  }

  // Revalida a coerência que o DTO (campos opcionais por variante) não garante;
  // erro só com nomes de campo, nunca o conteúdo.
  private resolveRange(req: CreateBlockRequest): {
    startAt: Date;
    endAt: Date;
  } {
    if (req.kind === 'FULL_DAYS') {
      const { fromDate, toDate } = req;
      if (
        typeof fromDate !== 'string' ||
        typeof toDate !== 'string' ||
        !isValidLocalDate(fromDate) ||
        !isValidLocalDate(toDate) ||
        toDate < fromDate
      ) {
        throw new DomainError('VALIDATION_FAILED', {
          fields: ['fromDate', 'toDate'],
        });
      }
      return {
        startAt: instantAt(fromDate, 0),
        endAt: instantAt(addLocalDays(toDate, 1), 0),
      };
    }
    const start = new Date(req.startAt);
    const end = new Date(req.endAt);
    if (
      typeof req.startAt !== 'string' ||
      typeof req.endAt !== 'string' ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new DomainError('VALIDATION_FAILED', {
        fields: ['startAt', 'endAt'],
      });
    }
    return { startAt: start, endAt: end };
  }
}
