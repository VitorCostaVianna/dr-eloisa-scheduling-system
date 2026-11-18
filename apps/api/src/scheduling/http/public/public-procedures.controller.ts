import { Controller, Get } from '@nestjs/common';
import type { PublicProcedureDto } from '@sistema-agendamento/shared-types';
import { Public } from '../../../auth/decorators/public.decorator';
import { toPublicProcedureDto } from '../presenters/procedure.presenter';
import { ProceduresService } from '../../application/procedures.service';

@Controller('public/procedures')
export class PublicProceduresController {
  constructor(private readonly procedures: ProceduresService) {}

  @Public()
  @Get()
  async list(): Promise<PublicProcedureDto[]> {
    return (await this.procedures.listPublic()).map(toPublicProcedureDto);
  }
}
