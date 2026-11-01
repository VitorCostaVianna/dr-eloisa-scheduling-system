import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidLocalDate } from '../time/clinic-time';

const MAX_YEAR = 9998;

// 'YYYY-MM-DD' que existe no calendário (rejeita '2026-02-30'). O ano máximo é 9998:
// os casos de uso somam 1 dia ao fim do intervalo e 9999-12-31 + 1 estoura o calendário (500).
export function IsLocalDate(options?: ValidationOptions): PropertyDecorator {
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
        validate: (value: unknown) =>
          typeof value === 'string' &&
          isValidLocalDate(value) &&
          Number(value.slice(0, 4)) <= MAX_YEAR,
      },
    });
  };
}
