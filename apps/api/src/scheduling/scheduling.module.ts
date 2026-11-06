import { Module } from '@nestjs/common';
import { HolidayOverridesService } from './application/holiday-overrides.service';
import { ProceduresService } from './application/procedures.service';
import { ProfessionalContextService } from './application/professional-context.service';
import { ScheduleConfigService } from './application/schedule-config.service';
import { BlocksController } from './http/dentist/blocks.controller';
import { HolidaysController } from './http/dentist/holidays.controller';
import { ProceduresController } from './http/dentist/procedures.controller';
import { WorkingHoursController } from './http/dentist/working-hours.controller';
import { ScheduleRepository } from './infra/schedule.repository';
import { PublicProceduresController } from './http/public/public-procedures.controller';
import { HolidayOverrideRepository } from './infra/holiday-override.repository';
import { ProcedureRepository } from './infra/procedure.repository';

@Module({
  controllers: [
    ProceduresController,
    PublicProceduresController,
    WorkingHoursController,
    BlocksController,
    HolidaysController,
  ],
  providers: [
    ProfessionalContextService,
    ProcedureRepository,
    ProceduresService,
    ScheduleRepository,
    ScheduleConfigService,
    HolidayOverrideRepository,
    HolidayOverridesService,
  ],
  exports: [ProfessionalContextService],
})
export class SchedulingModule {}
