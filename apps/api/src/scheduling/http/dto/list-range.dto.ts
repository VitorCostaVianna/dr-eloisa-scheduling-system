import { IsLocalDate } from '../../../common/validation/is-local-date';

// to ≥ from e o limite de dias são regras do caso de uso (variam por endpoint).
export class ListRangeDto {
  @IsLocalDate()
  from: string;

  @IsLocalDate()
  to: string;
}
