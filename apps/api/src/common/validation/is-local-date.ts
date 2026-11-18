import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidLocalDate } from '../time/clinic-time';

const MAX_YEAR = 9998;

export interface LocalDateYearRange {
  minYear?: number;
  maxYear?: number;
}

// 'YYYY-MM-DD' que existe no calendário (rejeita '2026-02-30'). O ano mínimo padrão é 1 (addLocalDays(d, -1) em 0000-01-01 gera ano negativo → 500) e o máximo 9998:
// os casos de uso somam 1 dia ao fim do intervalo e 9999-12-31 + 1 estoura o calendário (500).
// `range` estreita a faixa de anos quando o endpoint tem limite próprio.
export function IsLocalDate(
  options?: ValidationOptions,
  range: LocalDateYearRange = {},
): PropertyDecorator {
  const minYear = range.minYear ?? 1;
  const maxYear = Math.min(range.maxYear ?? MAX_YEAR, MAX_YEAR);
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isLocalDate',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: {
        message: '$property deve ser uma data válida no formato AAAA-MM-DD',
        ...options,
      },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string' || !isValidLocalDate(value)) {
            return false;
          }
          const year = Number(value.slice(0, 4));
          return year >= minYear && year <= maxYear;
        },
      },
    });
  };
}
