import { registerDecorator, ValidationOptions } from 'class-validator';

// Rejeita caracteres de controle (inclui quebra de linha e NUL) em campos de linha única.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

export function NoControlChars(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'noControlChars',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: {
        message: '$property não pode conter caracteres de controle',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && !CONTROL_CHARS.test(value),
      },
    });
  };
}
