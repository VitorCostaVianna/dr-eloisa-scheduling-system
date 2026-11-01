import { Module } from '@nestjs/common';
import { ProceduresService } from './application/procedures.service';
import { ProfessionalContextService } from './application/professional-context.service';
import { ScheduleConfigService } from './application/schedule-config.service';
import { BlocksController } from './http/dentist/blocks.controller';
import { ProceduresController } from './http/dentist/procedures.controller';
import { WorkingHoursController } from './http/dentist/working-hours.controller';
import { ScheduleRepository } from './infra/schedule.repository';
import { PublicProceduresController } from './http/public/public-procedures.controller';
import { ProcedureRepository } from './infra/procedure.repository';

@Module({
  controllers: [
    ProceduresController,
    PublicProceduresController,
    WorkingHoursController,
    BlocksController,
  ],
  providers: [
    ProfessionalContextService,
    ProcedureRepository,
    ProceduresService,
    ScheduleRepository,
    ScheduleConfigService,
  ],
  exports: [ProfessionalContextService],
})
export class SchedulingModule {}
