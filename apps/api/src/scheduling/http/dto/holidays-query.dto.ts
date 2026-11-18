import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import {
  HOLIDAY_YEAR_MAX,
  HOLIDAY_YEAR_MIN,
} from '@sistema-agendamento/shared-types';

export class HolidaysQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(HOLIDAY_YEAR_MIN)
  @Max(HOLIDAY_YEAR_MAX)
  year: number;
}
