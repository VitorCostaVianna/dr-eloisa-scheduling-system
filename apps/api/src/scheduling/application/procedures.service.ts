import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { isValidProcedureDuration } from '../domain/procedure-rules';
import {
  ProcedureRecord,
  ProcedureRepository,
} from '../infra/procedure.repository';
import { ProfessionalContextService } from './professional-context.service';

@Injectable()
export class ProceduresService {
  constructor(
    private readonly procedures: ProcedureRepository,
    private readonly context: ProfessionalContextService,
  ) {}

  list(professionalId: string): Promise<ProcedureRecord[]> {
    return this.procedures.findByProfessional(professionalId, {
      onlyActive: false,
    });
  }

  async listPublic(): Promise<ProcedureRecord[]> {
    const professionalId = await this.context.forPublic();
    return this.procedures.findByProfessional(professionalId, {
      onlyActive: true,
    });
  }

  create(
    professionalId: string,
    input: { name: string; durationMinutes: number },
  ): Promise<ProcedureRecord> {
    const name = this.cleanName(input.name);
    this.assertDuration(input.durationMinutes);
    return this.procedures.create(professionalId, {
      name,
      durationMinutes: input.durationMinutes,
    });
  }

  async update(
    professionalId: string,
    id: string,
    patch: { name?: string; durationMinutes?: number; active?: boolean },
  ): Promise<ProcedureRecord> {
    const data = {
      ...(patch.name !== undefined ? { name: this.cleanName(patch.name) } : {}),
      ...(patch.durationMinutes !== undefined
        ? { durationMinutes: patch.durationMinutes }
        : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    };
    if (data.durationMinutes !== undefined) {
      this.assertDuration(data.durationMinutes);
    }
    const current = await this.procedures.findOne(professionalId, id);
    if (!current) throw new DomainError('NOT_FOUND');
    return this.procedures.update(id, data);
  }

  private cleanName(raw: string): string {
    const name = raw.trim();
    if (name.length === 0) {
      throw new DomainError('VALIDATION_FAILED', { fields: ['name'] });
    }
    return name;
  }

  private assertDuration(minutes: number): void {
    if (!isValidProcedureDuration(minutes)) {
      throw new DomainError('INVALID_DURATION');
    }
  }
}
