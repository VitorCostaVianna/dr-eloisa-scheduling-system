import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { WorkingHoursDto } from '@sistema-agendamento/shared-types';
import { ProfessionalContextService } from '../../application/professional-context.service';
import { ScheduleConfigService } from '../../application/schedule-config.service';

@Controller('working-hours')
export class WorkingHoursController {
  constructor(
    private readonly config: ScheduleConfigService,
    private readonly context: ProfessionalContextService,
  ) {}

  @Get()
  async list(@Req() req: Request): Promise<WorkingHoursDto[]> {
    return this.config.listWorkingHours(
      await this.context.forUser(req.user!.sub),
    );
  }
}
