import { registerDecorator, ValidationOptions } from 'class-validator';

// ISO 8601 com fuso explícito ('Z' ou ±HH:mm). Sem fuso o instante seria ambíguo.
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function IsIsoInstant(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isIsoInstant',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: {
        message:
          '$property deve ser um instante ISO 8601 com fuso (Z ou offset)',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          ISO_INSTANT.test(value) &&
          !Number.isNaN(Date.parse(value)),
      },
    });
  };
}
