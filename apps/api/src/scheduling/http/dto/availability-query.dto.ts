import { IsOptional, IsUUID } from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date';

// to ≥ from e o limite de dias são regras do caso de uso (AVAILABILITY_MAX_DAYS).
export class AvailabilityQueryDto {
  @IsLocalDate()
  from: string;

  @IsLocalDate()
  to: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;
}
