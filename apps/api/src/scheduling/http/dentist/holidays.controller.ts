import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  HolidayDto,
  HolidayOverrideDto,
} from '@sistema-agendamento/shared-types';
import { HolidayOverridesService } from '../../application/holiday-overrides.service';
import { ProfessionalContextService } from '../../application/professional-context.service';
import {
  CreateHolidayOverrideDto,
  HolidayOverrideDateParamDto,
} from '../dto/create-holiday-override.dto';
import { HolidaysQueryDto } from '../dto/holidays-query.dto';

@Controller()
export class HolidaysController {
  constructor(
    private readonly holidays: HolidayOverridesService,
    private readonly context: ProfessionalContextService,
  ) {}

  @Get('holidays')
  async list(
    @Req() req: Request,
    @Query() query: HolidaysQueryDto,
  ): Promise<HolidayDto[]> {
    return this.holidays.listHolidays(
      await this.context.forUser(req.user!.sub),
      query.year,
    );
  }

  // POST responde 201 por padrão no Nest (também na 2ª chamada, idempotente).
  @Post('holiday-overrides')
  async create(
    @Req() req: Request,
    @Body() dto: CreateHolidayOverrideDto,
  ): Promise<HolidayOverrideDto> {
    return this.holidays.override(
      await this.context.forUser(req.user!.sub),
      dto.date,
    );
  }

  @Delete('holiday-overrides/:date')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @Param() params: HolidayOverrideDateParamDto,
  ): Promise<void> {
    await this.holidays.undoOverride(
      await this.context.forUser(req.user!.sub),
      params.date,
    );
  }
}
