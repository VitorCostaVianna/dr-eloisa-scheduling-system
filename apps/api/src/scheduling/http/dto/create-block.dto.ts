import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  BLOCK_REASON_MAX,
  CreateBlockRequest,
} from '@sistema-agendamento/shared-types';
import { IsIsoInstant } from '../../../common/validation/is-iso-instant';
import { IsLocalDate } from '../../../common/validation/is-local-date';
import { NoControlChars } from '../../../common/validation/no-control-chars';

type Kind = CreateBlockRequest['kind'];
const KINDS: Kind[] = ['FULL_DAYS', 'PERIOD'];

// Campos de cada variante só são validados quando `kind` a seleciona; a
// coerência entre eles (ordem, intervalo) é do caso de uso.
export class CreateBlockDto {
  @IsIn(KINDS)
  kind: Kind;

  @ValidateIf((o: CreateBlockDto) => o.kind === 'FULL_DAYS')
  @IsLocalDate()
  fromDate?: string;

  @ValidateIf((o: CreateBlockDto) => o.kind === 'FULL_DAYS')
  @IsLocalDate()
  toDate?: string;

  @ValidateIf((o: CreateBlockDto) => o.kind === 'PERIOD')
  @IsIsoInstant()
  startAt?: string;

  @ValidateIf((o: CreateBlockDto) => o.kind === 'PERIOD')
  @IsIsoInstant()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BLOCK_REASON_MAX)
  @NoControlChars()
  reason?: string;
}
