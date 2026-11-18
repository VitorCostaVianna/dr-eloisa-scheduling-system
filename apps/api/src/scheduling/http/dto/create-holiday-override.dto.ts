import {
  HOLIDAY_YEAR_MAX,
  HOLIDAY_YEAR_MIN,
} from '@sistema-agendamento/shared-types';
import { IsLocalDate } from '../../../common/validation/is-local-date';

// "É feriado?" é regra do caso de uso (NOT_A_HOLIDAY, 422), não da borda. A faixa de
// anos é a mesma do GET /holidays: fora dela o desbloqueio ficaria invisível na lista.
export class CreateHolidayOverrideDto {
  @IsLocalDate(undefined, {
    minYear: HOLIDAY_YEAR_MIN,
    maxYear: HOLIDAY_YEAR_MAX,
  })
  date: string;
}

// `:date` do DELETE passa pela mesma validação de data local (400 VALIDATION_FAILED).
export class HolidayOverrideDateParamDto {
  @IsLocalDate()
  date: string;
}
