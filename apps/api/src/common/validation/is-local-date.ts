import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidLocalDate } from '../time/clinic-time';

// 'YYYY-MM-DD' que existe no calendário (rejeita '2026-02-30').
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
          typeof value === 'string' && isValidLocalDate(value),
      },
    });
  };
}
