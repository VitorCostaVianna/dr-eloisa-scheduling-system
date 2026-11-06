import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  dbDateToLocalDate,
  localDateToDbDate,
  type LocalDate,
} from '../../common/time/clinic-time';
import { PrismaService } from '../../prisma/prisma.service';

export interface HolidayOverrideRecord {
  id: string;
  date: LocalDate;
}

const SELECT = { id: true, date: true } as const;

function toRecord(row: { id: string; date: Date }): HolidayOverrideRecord {
  return { id: row.id, date: dbDateToLocalDate(row.date) };
}

@Injectable()
export class HolidayOverrideRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Desbloqueios com data em [from, to] (datas locais), por data. */
  async findInRange(
    professionalId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<HolidayOverrideRecord[]> {
    const rows = await this.prisma.holidayOverride.findMany({
      where: {
        professionalId,
        date: { gte: localDateToDbDate(from), lte: localDateToDbDate(to) },
      },
      orderBy: { date: 'asc' },
      select: SELECT,
    });
    return rows.map(toRecord);
  }

  /**
   * Idempotente: a 2ª chamada para a mesma data devolve a mesma linha.
   * Um só comando (INSERT … ON CONFLICT … RETURNING): não há janela entre gravar e
   * ler em que um DELETE concorrente faça o POST falhar. O `DO UPDATE` sem efeito
   * existe só para o RETURNING devolver a linha que já existia.
   * O id é gerado aqui porque o `@default(uuid())` do schema é do Prisma, não do banco.
   * A data vai como texto 'YYYY-MM-DD' com `::date`: literal de calendário, sem
   * depender do fuso da sessão do Postgres.
   */
  async upsert(
    professionalId: string,
    date: LocalDate,
  ): Promise<HolidayOverrideRecord> {
    const rows = await this.prisma.$queryRaw<{ id: string; date: Date }[]>`
      INSERT INTO "HolidayOverride" ("id", "professionalId", "date")
      VALUES (${randomUUID()}, ${professionalId}, ${date}::date)
      ON CONFLICT ("professionalId", "date") DO UPDATE SET "date" = EXCLUDED."date"
      RETURNING "id", "date"`;
    return toRecord(rows[0]);
  }

  /** `tx` repassado do caso de uso (lockSchedule já tomado). Devolve a contagem. */
  async delete(
    tx: Prisma.TransactionClient,
    professionalId: string,
    date: LocalDate,
  ): Promise<number> {
    const { count } = await tx.holidayOverride.deleteMany({
      where: { professionalId, date: localDateToDbDate(date) },
    });
    return count;
  }
}
