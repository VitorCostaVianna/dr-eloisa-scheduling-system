import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';
import { PROCEDURE_NAME_MAX } from '@sistema-agendamento/shared-types';
import { NoControlChars } from '../../../common/validation/no-control-chars';

export class CreateProcedureDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PROCEDURE_NAME_MAX)
  @NoControlChars()
  name: string;

  @IsInt()
  durationMinutes: number;
}
