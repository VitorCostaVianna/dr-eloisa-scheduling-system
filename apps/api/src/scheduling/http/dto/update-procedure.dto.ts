import {
  IsBoolean,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PROCEDURE_NAME_MAX } from '@sistema-agendamento/shared-types';
import { NoControlChars } from '../../../common/validation/no-control-chars';

export class UpdateProcedureDto {
  // ValidateIf em vez de IsOptional: IsOptional também deixaria passar null.
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(PROCEDURE_NAME_MAX)
  @NoControlChars()
  name?: string;

  // ValidateIf em vez de IsOptional: IsOptional também deixaria passar null.
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  durationMinutes?: number;

  // ValidateIf em vez de IsOptional: IsOptional também deixaria passar null.
  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  active?: boolean;
}
