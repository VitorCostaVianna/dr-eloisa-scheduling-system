import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProcedureRecord {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

export interface ProcedurePatch {
  name?: string;
  durationMinutes?: number;
  active?: boolean;
}

const SELECT = {
  id: true,
  name: true,
  durationMinutes: true,
  active: true,
} as const;

// Índice service_active_name_ci_key: lower(name) único entre ativos (RN-40).
const NAME_INDEX_TARGET = 'lower(name)';

@Injectable()
export class ProcedureRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ativos primeiro, depois nome. `onlyActive` para a lista pública. */
  findByProfessional(
    professionalId: string,
    opts: { onlyActive: boolean },
  ): Promise<ProcedureRecord[]> {
    return this.prisma.service.findMany({
      where: {
        professionals: { some: { id: professionalId } },
        ...(opts.onlyActive ? { active: true } : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: SELECT,
    });
  }

  findOne(professionalId: string, id: string): Promise<ProcedureRecord | null> {
    return this.prisma.service.findFirst({
      where: { id, professionals: { some: { id: professionalId } } },
      select: SELECT,
    });
  }

  async create(
    professionalId: string,
    data: { name: string; durationMinutes: number },
  ): Promise<ProcedureRecord> {
    try {
      return await this.prisma.service.create({
        data: {
          ...data,
          professionals: { connect: { id: professionalId } },
        },
        select: SELECT,
      });
    } catch (err) {
      throw this.translate(err);
    }
  }

  async update(id: string, patch: ProcedurePatch): Promise<ProcedureRecord> {
    try {
      return await this.prisma.service.update({
        where: { id },
        data: patch,
        select: SELECT,
      });
    } catch (err) {
      throw this.translate(err);
    }
  }

  private translate(err: unknown): unknown {
    if (isUniqueViolation(err, NAME_INDEX_TARGET)) {
      return new DomainError('PROCEDURE_NAME_TAKEN');
    }
    return err;
  }
}
