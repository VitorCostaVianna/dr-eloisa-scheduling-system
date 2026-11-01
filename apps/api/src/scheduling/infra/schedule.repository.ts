import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface WorkingHoursRecord {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface BlockRecord {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  createdAt: Date;
}

const BLOCK_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  reason: true,
  createdAt: true,
} as const;

@Injectable()
export class ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ordenado por dayOfWeek, startMinute. */
  findWorkingHours(professionalId: string): Promise<WorkingHoursRecord[]> {
    return this.prisma.workingHours.findMany({
      where: { professionalId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    });
  }

  /** Bloqueios que intersectam [from, to), por startAt. */
  findBlocksIntersecting(
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<BlockRecord[]> {
    return this.prisma.scheduleBlock.findMany({
      where: { professionalId, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: 'asc' },
      select: BLOCK_SELECT,
    });
  }

  /** `tx` repassado do caso de uso (lockSchedule já tomado). */
  insertBlock(
    tx: Prisma.TransactionClient,
    professionalId: string,
    data: { startAt: Date; endAt: Date; reason: string | null },
  ): Promise<BlockRecord> {
    return tx.scheduleBlock.create({
      data: { professionalId, ...data },
      select: BLOCK_SELECT,
    });
  }

  /** Devolve quantas linhas removeu (0 = inexistente ou de outra profissional). */
  async deleteBlock(professionalId: string, id: string): Promise<number> {
    const { count } = await this.prisma.scheduleBlock.deleteMany({
      where: { id, professionalId },
    });
    return count;
  }
}
