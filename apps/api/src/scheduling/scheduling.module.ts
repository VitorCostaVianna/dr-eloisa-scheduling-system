import { Module } from '@nestjs/common';
import { ProfessionalContextService } from './application/professional-context.service';

@Module({
  providers: [ProfessionalContextService],
  exports: [ProfessionalContextService],
})
export class SchedulingModule {}
