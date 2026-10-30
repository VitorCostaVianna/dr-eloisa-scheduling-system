import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PROCEDURE_NAME_MAX } from '@sistema-agendamento/shared-types';
import { NoControlChars } from '../../../common/validation/no-control-chars';

export class UpdateProcedureDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PROCEDURE_NAME_MAX)
  @NoControlChars()
  name?: string;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
