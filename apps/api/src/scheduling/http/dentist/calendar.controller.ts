import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { CalendarResponse } from '@sistema-agendamento/shared-types';
import { CalendarService } from '../../application/calendar.service';
import { ProfessionalContextService } from '../../application/professional-context.service';
import { ListRangeDto } from '../dto/list-range.dto';
import { toCalendarResponse } from '../presenters/calendar.presenter';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly context: ProfessionalContextService,
  ) {}

  @Get()
  async get(
    @Req() req: Request,
    @Query() range: ListRangeDto,
  ): Promise<CalendarResponse> {
    return toCalendarResponse(
      await this.calendar.getCalendar(
        await this.context.forUser(req.user!.sub),
        range,
      ),
    );
  }
}
