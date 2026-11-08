import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AvailabilityResponse } from '@sistema-agendamento/shared-types';
import { Public } from '../../../auth/decorators/public.decorator';
import { AvailabilityService } from '../../application/availability.service';
import { AvailabilityQueryDto } from '../dto/availability-query.dto';

@Controller('public/availability')
export class PublicAvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  get(@Query() query: AvailabilityQueryDto): Promise<AvailabilityResponse> {
    return this.availability.getPublicAvailability(query);
  }
}
