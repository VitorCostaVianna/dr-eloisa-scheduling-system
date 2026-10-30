import { Module } from '@nestjs/common';
import { ProceduresService } from './application/procedures.service';
import { ProfessionalContextService } from './application/professional-context.service';
import { ProceduresController } from './http/dentist/procedures.controller';
import { PublicProceduresController } from './http/public/public-procedures.controller';
import { ProcedureRepository } from './infra/procedure.repository';

@Module({
  controllers: [ProceduresController, PublicProceduresController],
  providers: [
    ProfessionalContextService,
    ProcedureRepository,
    ProceduresService,
  ],
  exports: [ProfessionalContextService],
})
export class SchedulingModule {}
